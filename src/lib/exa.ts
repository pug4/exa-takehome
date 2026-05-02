import { requireExaApiKey } from "./env";
import { parseSseStream, SSE_DONE, tryParseJson } from "./sse";

const EXA_BASE_URL = "https://api.exa.ai";

export type ExaSearchType =
  | "neural"
  | "fast"
  | "auto"
  | "deep-lite"
  | "deep"
  | "deep-reasoning"
  | "instant";

export type ExaCategory =
  | "company"
  | "research paper"
  | "news"
  | "personal site"
  | "financial report"
  | "people";

export interface ExaCitation {
  id?: string;
  url: string;
  title?: string;
  author?: string | null;
  publishedDate?: string | null;
  text?: string;
  image?: string;
  favicon?: string;
}

/** Field-level grounding entry returned by /search when outputSchema is set. */
export interface ExaGroundingEntry {
  field: string;
  citations: Array<{ url: string; title?: string }>;
  confidence?: "low" | "medium" | "high";
}

export interface ExaSearchResult {
  results: Array<{
    id?: string;
    url: string;
    title?: string;
    publishedDate?: string | null;
    author?: string | null;
    text?: string;
    highlights?: string[];
    summary?: string;
  }>;
  output?: {
    content: unknown;
    grounding?: ExaGroundingEntry[];
  };
  costDollars?: { total: number };
}

interface JsonSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  description?: string;
  additionalProperties?: boolean;
  items?: unknown;
  enum?: unknown[];
}

export interface ExaSearchRequest {
  query: string;
  type?: ExaSearchType;
  numResults?: number;
  category?: ExaCategory;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  outputSchema?: JsonSchema;
  systemPrompt?: string;
  contents?: {
    text?: boolean | { maxCharacters?: number };
    highlights?: boolean | { query?: string };
    summary?: { query?: string; schema?: JsonSchema };
    maxAgeHours?: number;
  };
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ExaFetchOptions {
  retry?: boolean;
  signal?: AbortSignal;
  accept?: string;
}

async function exaFetch(
  path: string,
  body: unknown,
  { retry = true, signal, accept = "application/json" }: ExaFetchOptions = {},
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(`${EXA_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "x-api-key": requireExaApiKey(),
          "Content-Type": "application/json",
          Accept: accept,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (response.ok) return response;

      if (retry && RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
        await sleep(750 * Math.pow(2, attempt));
        continue;
      }

      const text = await response.text().catch(() => "");
      throw new Error(
        `Exa request failed: ${response.status} ${response.statusText} ${text}`.slice(
          0,
          500,
        ),
      );
    } catch (error) {
      lastError = error;
      if ((error as Error)?.name === "AbortError") throw error;
      if (retry && attempt < MAX_RETRIES) {
        await sleep(750 * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Exa request failed");
}

export async function exaSearch(
  request: ExaSearchRequest,
): Promise<ExaSearchResult> {
  const response = await exaFetch("/search", request);
  return (await response.json()) as ExaSearchResult;
}

export interface StructuredSearchResponse<T> {
  data: T | null;
  citations: ExaCitation[];
  grounding: ExaGroundingEntry[];
  raw: ExaSearchResult;
}

/**
 * Run a /search call with an outputSchema and return the synthesized
 * structured object plus citations from both `results[]` and
 * `output.grounding[]`. This is the canonical replacement for the legacy
 * `/answer` endpoint per docs.exa.ai/reference/search-api-guide-for-coding-agents.
 */
export async function exaSearchStructured<T = unknown>(
  query: string,
  outputSchema: JsonSchema,
  options: Omit<ExaSearchRequest, "query" | "outputSchema"> = {},
): Promise<StructuredSearchResponse<T>> {
  const result = await exaSearch({
    query,
    outputSchema,
    type: options.type ?? "auto",
    ...options,
  });

  const data = (result.output?.content ?? null) as T | null;
  const grounding = result.output?.grounding ?? [];
  const citations = mergeCitations(
    toCitations(result.results),
    citationsFromGrounding(grounding),
  );
  return { data, citations, grounding, raw: result };
}

export interface SearchStreamChunk {
  /** Cumulative text synthesized so far (for `{type: "text"}` outputSchema). */
  partialAnswer: string;
  /** Just the new text appended in this chunk. */
  delta: string;
  /** Citations seen so far (best-effort, may be empty mid-stream). */
  citations: ExaCitation[];
  /** Field-level grounding entries (populated near end of stream). */
  grounding: ExaGroundingEntry[];
}

interface ExaStreamFrame {
  type?: "text-delta" | "grounding" | "results" | "done" | string;
  // Text-delta frames
  delta?: string;
  choices?: Array<{
    delta?: {
      content?: string;
      role?: string;
      citations?: ExaCitation[];
    };
    finish_reason?: string | null;
  }>;
  // Grounding / results / done frames
  grounding?: ExaGroundingEntry[];
  citations?: ExaCitation[];
  results?: ExaSearchResult["results"];
  output?: ExaSearchResult["output"];
  costDollars?: { total: number };
}

/**
 * Stream Exa /search responses (with `stream: true`). Each frame is an
 * OpenAI-compatible chat-completion chunk plus Exa-specific event types
 * (`text-delta`, `grounding`, `results`, `done`). The generator yields
 * progressively-accumulating partial answers so callers can render text
 * as it arrives. Use `outputSchema: {type: "text"}` to get plain text
 * deltas that don't need JSON parsing.
 */
export async function* streamExaSearch(
  request: ExaSearchRequest,
  signal?: AbortSignal,
): AsyncGenerator<SearchStreamChunk> {
  const response = await exaFetch(
    "/search",
    { ...request, stream: true },
    { accept: "text/event-stream", retry: false, signal },
  );

  if (!response.body) {
    throw new Error("Exa stream has no body");
  }

  let assembled = "";
  let citations: ExaCitation[] = [];
  let grounding: ExaGroundingEntry[] = [];

  for await (const payload of parseSseStream(response.body)) {
    if (payload === SSE_DONE) return;

    const frame = tryParseJson<ExaStreamFrame>(payload);
    if (!frame) continue;

    if (Array.isArray(frame.grounding) && frame.grounding.length > 0) {
      grounding = frame.grounding;
    }

    if (Array.isArray(frame.citations) && frame.citations.length > 0) {
      citations = mergeCitations(citations, frame.citations);
    }

    if (Array.isArray(frame.results) && frame.results.length > 0) {
      citations = mergeCitations(citations, toCitations(frame.results));
    }

    if (frame.output?.grounding && frame.output.grounding.length > 0) {
      grounding = frame.output.grounding;
      citations = mergeCitations(citations, citationsFromGrounding(grounding));
    }

    const delta = extractDelta(frame);
    if (delta) {
      assembled += delta;
    }

    if (delta || frame.type === "grounding" || frame.type === "results" || frame.type === "done") {
      yield { partialAnswer: assembled, delta, citations, grounding };
    }
  }
}

function extractDelta(frame: ExaStreamFrame): string {
  if (typeof frame.delta === "string" && frame.delta.length > 0) {
    return frame.delta;
  }
  const content = frame.choices?.[0]?.delta?.content;
  return typeof content === "string" ? content : "";
}

function toCitations(
  results: ExaSearchResult["results"] | undefined,
): ExaCitation[] {
  return (results ?? []).map((r) => ({
    url: r.url,
    title: r.title,
    publishedDate: r.publishedDate ?? null,
    author: r.author ?? null,
    text: r.text,
  }));
}

function citationsFromGrounding(
  grounding: ExaGroundingEntry[] | undefined,
): ExaCitation[] {
  if (!grounding) return [];
  const out: ExaCitation[] = [];
  for (const entry of grounding) {
    for (const c of entry.citations ?? []) {
      if (c?.url) out.push({ url: c.url, title: c.title });
    }
  }
  return out;
}

function mergeCitations(
  ...lists: Array<ExaCitation[] | undefined>
): ExaCitation[] {
  const seen = new Map<string, ExaCitation>();
  for (const list of lists) {
    if (!list) continue;
    for (const c of list) {
      if (!c?.url) continue;
      const existing = seen.get(c.url);
      if (!existing) {
        seen.set(c.url, c);
      } else {
        seen.set(c.url, {
          ...existing,
          title: existing.title ?? c.title,
          author: existing.author ?? c.author ?? null,
          publishedDate: existing.publishedDate ?? c.publishedDate ?? null,
          text: existing.text ?? c.text,
        });
      }
    }
  }
  return [...seen.values()];
}

export function dedupeCitations(citations: ExaCitation[]): ExaCitation[] {
  return mergeCitations(citations);
}
