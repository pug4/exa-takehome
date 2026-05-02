import type {
  Monitor,
  MonitorFinding,
  MonitorFindingKind,
  MonitorFindingSeverity,
  MonitorRunSummary,
  MonitorSource,
} from "@/types/monitoring";
import { exaSearchStructured } from "../exa";
import { newEventId, newResultId } from "../ids";
import { getDomain } from "../url";
import { clampInterval, nextRunAt } from "./sources";
import {
  appendRunSummary,
  getSeenUrls,
  recordSeenUrls,
  saveFinding,
  saveMonitor,
} from "./store";

/**
 * Maximum number of sources to scan in parallel per run. Each source costs
 * 2 Exa searches, so a small number keeps a single tick from saturating
 * Exa's rate limits.
 */
const SOURCE_CONCURRENCY = 4;

const FINDING_KINDS = [
  "news",
  "announcement",
  "product_launch",
  "funding",
  "hiring",
  "partnership",
  "regulation",
  "page_change",
  "other",
] as const satisfies readonly MonitorFindingKind[];

const FINDING_SEVERITIES = [
  "info",
  "update",
  "alert",
] as const satisfies readonly MonitorFindingSeverity[];

const findingsSchema = {
  type: "object",
  description: "Recent updates worth notifying a strategy consultant about.",
  properties: {
    findings: {
      type: "array",
      description:
        "Discrete pieces of news or fresh content discovered for the source.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: {
            type: "string",
            description:
              "1-2 sentences plainly explaining what happened and why it matters.",
          },
          url: {
            type: "string",
            description:
              "Canonical URL of the article, post, or page (not a homepage).",
          },
          publishedDate: {
            type: "string",
            description: "ISO-8601 publication date if available.",
          },
          kind: {
            type: "string",
            enum: [...FINDING_KINDS],
          },
          severity: {
            type: "string",
            enum: [...FINDING_SEVERITIES],
            description:
              "How material this is: info = background, update = noteworthy, alert = competitive/strategic risk.",
          },
        },
        required: ["title", "summary", "url", "kind", "severity"],
      },
    },
  },
  required: ["findings"],
  additionalProperties: false,
} as const;

interface FindingDraft {
  title: string;
  summary: string;
  url: string;
  publishedDate?: string;
  kind?: string;
  severity?: string;
}

interface FindingsPayload {
  findings: FindingDraft[];
}

interface CrawlerSourceResult {
  source: MonitorSource;
  drafts: FindingDraft[];
  error?: string;
}

interface RunMonitorOptions {
  /**
   * When true, ignore the monitor's `nextRunAt` and run regardless of
   * cadence. Used by the "Run now" button. The scheduler always passes
   * false (or omits it), letting the cadence gate take effect.
   */
  force?: boolean;
}

export interface RunMonitorResult {
  summary: MonitorRunSummary;
  newFindings: MonitorFinding[];
}

/**
 * Run one crawl of a monitor: scan each enabled source, dedupe against
 * previously-seen URLs, persist new findings, and update the monitor's
 * cadence book-keeping. Returns the run summary plus any findings that
 * were actually new (so the caller can stream them to the UI).
 *
 * Idempotency: re-running with the same monitor produces no duplicate
 * findings as long as the seen-URL set survives. Each finding gets a
 * fresh id on every run, but the URL dedupe prevents the user from seeing
 * the same article twice.
 */
export async function runMonitor(
  monitor: Monitor,
  options: RunMonitorOptions = {},
): Promise<RunMonitorResult> {
  const startedAt = new Date();
  const monitorRunId = `mrun_${newEventId()}`;

  if (!options.force && new Date(monitor.nextRunAt).getTime() > startedAt.getTime()) {
    // Not due yet — return an empty summary so the scheduler can record it.
    return {
      summary: emptySummary(monitor.engagementId, monitorRunId, startedAt),
      newFindings: [],
    };
  }

  const enabledSources = monitor.sources;
  const sourceResults: CrawlerSourceResult[] = await runWithConcurrency(
    enabledSources,
    SOURCE_CONCURRENCY,
    (source) => crawlSource(source, monitor.lastRunAt),
  );

  const seenUrls = new Set(await getSeenUrls(monitor.engagementId));
  const newFindings: MonitorFinding[] = [];
  const errors: MonitorRunSummary["errors"] = [];
  const newlySeen: string[] = [];

  for (const result of sourceResults) {
    if (result.error) {
      errors.push({ sourceUrl: result.source.url, message: result.error });
      continue;
    }

    for (const draft of result.drafts) {
      const url = sanitizeUrl(draft.url);
      if (!url) continue;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      newlySeen.push(url);

      const finding: MonitorFinding = {
        id: newResultId(),
        engagementId: monitor.engagementId,
        monitorRunId,
        source: result.source,
        title: truncate(draft.title || "Untitled update", 240),
        summary: truncate(draft.summary || "", 800),
        url,
        publishedDate: draft.publishedDate || null,
        kind: normalizeKind(draft.kind),
        severity: normalizeSeverity(draft.severity),
        discoveredAt: new Date().toISOString(),
        read: false,
      };
      newFindings.push(finding);
    }
  }

  // Persist findings sequentially to keep the writes ordered (which
  // makes the per-engagement zset honest about discovery order). Volume
  // per run is small (≤ 30) so this is fine.
  for (const finding of newFindings) {
    await saveFinding(finding);
  }

  if (newlySeen.length > 0) {
    await recordSeenUrls(monitor.engagementId, newlySeen);
  }

  const completedAt = new Date();
  const summary: MonitorRunSummary = {
    engagementId: monitor.engagementId,
    monitorRunId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    sourcesScanned: enabledSources.length,
    newFindings: newFindings.length,
    errors,
  };

  // Update each scanned source's lastCrawledAt timestamp.
  const lastCrawledAt = completedAt.toISOString();
  const successfulUrls = new Set(
    sourceResults.filter((r) => !r.error).map((r) => r.source.url),
  );
  const updatedSources: MonitorSource[] = monitor.sources.map((source) =>
    successfulUrls.has(source.url)
      ? { ...source, lastCrawledAt }
      : source,
  );

  const updatedMonitor: Monitor = {
    ...monitor,
    sources: updatedSources,
    lastRunAt: startedAt.toISOString(),
    nextRunAt: nextRunAt(
      completedAt.toISOString(),
      clampInterval(monitor.intervalMinutes),
    ),
    lastRunFindings: newFindings.length,
    totalFindings: monitor.totalFindings + newFindings.length,
    updatedAt: completedAt.toISOString(),
  };
  await saveMonitor(updatedMonitor);
  await appendRunSummary(summary);

  return { summary, newFindings };
}

async function crawlSource(
  source: MonitorSource,
  lastRunAt: string | undefined,
): Promise<CrawlerSourceResult> {
  try {
    const sinceIso = computeSince(lastRunAt);
    const [newsDrafts, siteDrafts] = await Promise.all([
      newsScan(source, sinceIso).catch((err) => {
        // News pass failures are common (rate-limit, no recent news) and
        // shouldn't fail the whole source — just record the error and let
        // the site pass run.
        console.warn(
          `[monitor] news scan failed for ${source.url}: ${formatError(err)}`,
        );
        return [] as FindingDraft[];
      }),
      siteScan(source, sinceIso).catch((err) => {
        console.warn(
          `[monitor] site scan failed for ${source.url}: ${formatError(err)}`,
        );
        return [] as FindingDraft[];
      }),
    ]);

    const drafts = mergeDrafts(newsDrafts, siteDrafts);
    return { source, drafts };
  } catch (error) {
    return { source, drafts: [], error: formatError(error) };
  }
}

async function newsScan(
  source: MonitorSource,
  sinceIso: string,
): Promise<FindingDraft[]> {
  const domain = getDomain(source.url);
  const query = `Latest news, announcements, product launches, funding, hiring, partnerships, M&A, or regulatory developments about ${source.label} (${source.url}). Prioritize coverage published after ${sinceIso}. Exclude generic press-release aggregators and SEO spam.`;

  const { data } = await exaSearchStructured<FindingsPayload>(
    query,
    findingsSchema as never,
    {
      type: "fast",
      numResults: 6,
      category: "news",
      startPublishedDate: sinceIso,
      excludeDomains: [domain],
      contents: { highlights: { query: source.label } },
      systemPrompt:
        "You are a continuous-monitoring agent for a strategy consultant. Surface only items that are actually new, material, and verifiable. Skip duplicates, generic listicles, and content older than the cutoff. If nothing material has happened, return an empty findings array.",
    },
  );

  return data?.findings ?? [];
}

async function siteScan(
  source: MonitorSource,
  sinceIso: string,
): Promise<FindingDraft[]> {
  const domain = getDomain(source.url);
  const query = `Find newly-published pages on ${source.url} since ${sinceIso}: blog posts, changelog entries, customer stories, product pages, leadership updates, or pricing changes. Exclude the homepage itself.`;

  const { data } = await exaSearchStructured<FindingsPayload>(
    query,
    findingsSchema as never,
    {
      type: "fast",
      numResults: 6,
      includeDomains: [domain],
      startPublishedDate: sinceIso,
      contents: {
        text: { maxCharacters: 1500 },
        // 24h cache is the right balance for a polling crawler — fresh
        // enough to catch real updates, cheap enough to not livecrawl on
        // every tick.
        maxAgeHours: 24,
      },
      systemPrompt:
        "You are a continuous-monitoring agent for a strategy consultant. Surface only newly-published pages on the target site that are likely to matter (product launches, blog posts, changelog entries, leadership updates, pricing changes). Treat the homepage URL as already known — do not return it as a finding. Mark site changes with kind='page_change'.",
    },
  );

  return data?.findings ?? [];
}

function mergeDrafts(...lists: FindingDraft[][]): FindingDraft[] {
  const seen = new Map<string, FindingDraft>();
  for (const list of lists) {
    for (const draft of list) {
      const url = sanitizeUrl(draft.url);
      if (!url) continue;
      if (seen.has(url)) continue;
      seen.set(url, { ...draft, url });
    }
  }
  return [...seen.values()];
}

function sanitizeUrl(input: string | undefined): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeKind(value: string | undefined): MonitorFindingKind {
  return (FINDING_KINDS as readonly string[]).includes(value ?? "")
    ? (value as MonitorFindingKind)
    : "other";
}

function normalizeSeverity(
  value: string | undefined,
): MonitorFindingSeverity {
  return (FINDING_SEVERITIES as readonly string[]).includes(value ?? "")
    ? (value as MonitorFindingSeverity)
    : "info";
}

function truncate(value: string, maxLength: number): string {
  if (typeof value !== "string") return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function computeSince(lastRunAt: string | undefined): string {
  // Default lookback if the monitor has never run: 24 hours.
  const fallback = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (!lastRunAt) return fallback.toISOString();
  const parsed = new Date(lastRunAt);
  if (Number.isNaN(parsed.getTime())) return fallback.toISOString();
  // Pad slightly so we don't miss items published in the same minute as
  // the previous run.
  return new Date(parsed.getTime() - 5 * 60 * 1000).toISOString();
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, concurrency);
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= items.length) return;
        results[idx] = await worker(items[idx]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function emptySummary(
  engagementId: string,
  monitorRunId: string,
  startedAt: Date,
): MonitorRunSummary {
  const iso = startedAt.toISOString();
  return {
    engagementId,
    monitorRunId,
    startedAt: iso,
    completedAt: iso,
    sourcesScanned: 0,
    newFindings: 0,
    errors: [],
  };
}
