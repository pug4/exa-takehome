import { NextResponse } from "next/server";
import type { Monitor, MonitorSource } from "@/types/monitoring";
import { getEngagement } from "@/lib/db";
import { createMonitorForEngagement } from "@/lib/monitoring/lifecycle";
import { clampInterval, nextRunAt } from "@/lib/monitoring/sources";
import {
  getMonitor,
  listFindings,
  listRecentRuns,
  saveMonitor,
} from "@/lib/monitoring/store";
import { getDomain, normalizeUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FINDINGS_LIMIT = 50;
const RUNS_LIMIT = 10;
const MAX_SOURCES = 30;

const ALLOWED_SOURCE_KINDS: ReadonlySet<MonitorSource["kind"]> = new Set([
  "client",
  "competitor",
  "emerging",
  "other",
]);

/**
 * Read the monitoring state for an engagement: the monitor config, the
 * most recent findings, and the last few run summaries (for the "Recent
 * runs" panel in the UI).
 *
 * If the monitor record is missing for any reason (legacy engagement,
 * earlier failure during creation), one is created on-demand so the UI
 * never has to special-case "no monitor yet" once an engagement exists.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const engagement = await getEngagement(id);
  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }

  let monitor = await getMonitor(id);
  if (!monitor) {
    monitor = await createMonitorForEngagement(engagement);
  }

  const [findings, runs] = await Promise.all([
    listFindings(id, FINDINGS_LIMIT),
    listRecentRuns(id, RUNS_LIMIT),
  ]);

  return NextResponse.json({ monitor, findings, runs });
}

interface PatchBody {
  enabled?: unknown;
  intervalMinutes?: unknown;
  sources?: unknown;
}

/**
 * Update the monitor config. Accepts partial updates: any field omitted
 * is left untouched. Source updates are atomic — the client sends the
 * full desired source list, which we validate, dedupe by domain, and
 * write back.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const engagement = await getEngagement(id);
  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existing = (await getMonitor(id)) ??
    (await createMonitorForEngagement(engagement));

  const updated: Monitor = { ...existing };

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 },
      );
    }
    updated.enabled = body.enabled;
  }

  if (body.intervalMinutes !== undefined) {
    const numeric = Number(body.intervalMinutes);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return NextResponse.json(
        { error: "intervalMinutes must be a positive number" },
        { status: 400 },
      );
    }
    updated.intervalMinutes = clampInterval(numeric);
  }

  if (body.sources !== undefined) {
    if (!Array.isArray(body.sources)) {
      return NextResponse.json(
        { error: "sources must be an array" },
        { status: 400 },
      );
    }
    const sanitized = sanitizeSources(body.sources, existing.sources);
    if (sanitized instanceof Error) {
      return NextResponse.json({ error: sanitized.message }, { status: 400 });
    }
    updated.sources = sanitized;
  }

  // If the cadence changed and we already have a lastRunAt, recompute the
  // next run from the new interval so a longer cadence takes effect right
  // away rather than waiting for the previously-scheduled tick.
  if (body.intervalMinutes !== undefined) {
    const base = updated.lastRunAt ?? new Date().toISOString();
    updated.nextRunAt = nextRunAt(base, updated.intervalMinutes);
  }

  updated.updatedAt = new Date().toISOString();
  await saveMonitor(updated);

  return NextResponse.json({ monitor: updated });
}

interface IncomingSource {
  id?: unknown;
  url?: unknown;
  label?: unknown;
  kind?: unknown;
  addedAt?: unknown;
  lastCrawledAt?: unknown;
}

function sanitizeSources(
  raw: unknown[],
  existing: MonitorSource[],
): MonitorSource[] | Error {
  if (raw.length > MAX_SOURCES) {
    return new Error(`At most ${MAX_SOURCES} sources are allowed`);
  }

  const existingById = new Map(existing.map((s) => [s.id, s]));
  const seenDomains = new Set<string>();
  const out: MonitorSource[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return new Error("Each source must be an object");
    }
    const candidate = item as IncomingSource;
    const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
    if (!url) return new Error("Each source must have a url");
    const canonical = normalizeUrl(url);
    if (!canonical || !/^https?:\/\//i.test(canonical)) {
      return new Error(`Invalid url: ${url}`);
    }
    const domain = getDomain(canonical).toLowerCase();
    if (!domain) return new Error(`Could not derive domain from ${url}`);
    if (seenDomains.has(domain)) continue; // silently dedupe
    seenDomains.add(domain);

    const kindRaw = typeof candidate.kind === "string" ? candidate.kind : "";
    const kind = ALLOWED_SOURCE_KINDS.has(kindRaw as MonitorSource["kind"])
      ? (kindRaw as MonitorSource["kind"])
      : "other";

    const label =
      typeof candidate.label === "string" && candidate.label.trim()
        ? candidate.label.trim().slice(0, 120)
        : domain;

    const id =
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim().slice(0, 120)
        : `src_${kind}_${domain.replace(/[^a-z0-9]+/g, "_")}`;

    const previous = existingById.get(id);
    out.push({
      id,
      url: canonical,
      label,
      kind,
      addedAt: previous?.addedAt ?? new Date().toISOString(),
      lastCrawledAt: previous?.lastCrawledAt,
    });
  }

  return out;
}
