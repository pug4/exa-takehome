import type { Engagement } from "@/types/engagement";
import type {
  Competitor,
  CompetitorList,
  EmergingPlayer,
  EmergingPlayersResult,
  ResearchResult,
} from "@/types/research";
import type {
  Monitor,
  MonitorSource,
  MonitorSourceKind,
} from "@/types/monitoring";
import { getDomain, normalizeUrl } from "../url";

const MAX_SOURCES = 30;
const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 60 * 24 * 7;
export const DEFAULT_INTERVAL_MINUTES = 60;

/**
 * Build the initial set of sources for a freshly-created engagement: the
 * client's own URL plus any competitor URLs the user supplied at creation
 * time. Order is preserved (client first), and entries are deduped by
 * normalized URL.
 */
export function buildInitialSources(engagement: Engagement): MonitorSource[] {
  const now = new Date().toISOString();
  const sources: MonitorSource[] = [];
  const seen = new Set<string>();

  const pushSource = (
    url: string,
    label: string,
    kind: MonitorSourceKind,
  ): void => {
    const canonical = normalizeUrl(url);
    if (!canonical) return;
    const key = canonical.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    sources.push({
      id: `src_${kind}_${getDomain(canonical).replace(/[^a-z0-9]+/gi, "_")}`,
      url: canonical,
      label: label || getDomain(canonical),
      kind,
      addedAt: now,
    });
  };

  pushSource(
    engagement.clientUrl,
    engagement.clientName ??
      engagement.projectName ??
      getDomain(engagement.clientUrl),
    "client",
  );

  for (const competitorUrl of engagement.knownCompetitors ?? []) {
    pushSource(competitorUrl, getDomain(competitorUrl), "competitor");
  }

  return sources.slice(0, MAX_SOURCES);
}

export interface SourceCandidate {
  url: string;
  name?: string;
}

/**
 * Merge a freshly-discovered list of source candidates into an existing
 * monitor without disturbing user-curated sources.
 *
 * - Existing sources are kept as-is — their labels, kinds, and
 *   `lastCrawledAt` win, so a user-edited label or a competitor that's
 *   already being monitored never gets clobbered by a later discovery
 *   pass that happens to surface the same domain.
 * - New candidates are appended in their input order with the supplied
 *   `kind`.
 * - The combined list is capped at `MAX_SOURCES` so a particularly broad
 *   discovery pass (e.g. emerging-players returning 30+ entries) can't
 *   blow up the monitor.
 *
 * Returns the merged source list and the count of newly added sources.
 */
export function mergeMonitorSources(
  existing: MonitorSource[],
  candidates: readonly SourceCandidate[],
  kind: MonitorSourceKind,
): { sources: MonitorSource[]; addedCount: number } {
  const now = new Date().toISOString();
  const existingByDomain = new Map<string, MonitorSource>();
  for (const source of existing) {
    const domain = getDomain(source.url);
    if (!domain) continue;
    existingByDomain.set(domain.toLowerCase(), source);
  }

  const merged = [...existing];
  let addedCount = 0;

  for (const candidate of candidates) {
    if (merged.length >= MAX_SOURCES) break;
    const canonical = normalizeUrl(candidate.url);
    if (!canonical) continue;
    const domain = getDomain(canonical);
    if (!domain) continue;
    const key = domain.toLowerCase();
    if (existingByDomain.has(key)) continue;
    const label = candidate.name?.trim() || domain;
    const newSource: MonitorSource = {
      id: `src_${kind}_${key.replace(/[^a-z0-9]+/g, "_")}`,
      url: canonical,
      label,
      kind,
      addedAt: now,
    };
    merged.push(newSource);
    existingByDomain.set(key, newSource);
    addedCount += 1;
  }

  return { sources: merged, addedCount };
}

/**
 * Extract candidate competitor sources from a competitors-agent result.
 * Filters down to direct or partial competitors with medium+ confidence
 * — low-confidence guesses would just generate noisy notifications.
 */
export function competitorsToSourceCandidates(
  result: ResearchResult<"competitors"> | undefined,
): SourceCandidate[] {
  if (!result?.data?.competitors?.length) return [];
  return filterCompetitors(result.data.competitors).map((c) => ({
    url: c.websiteUrl,
    name: c.name,
  }));
}

export function filterCompetitors(
  competitors: CompetitorList["competitors"],
): Competitor[] {
  return competitors.filter(
    (c) =>
      c?.websiteUrl &&
      (c.competitorType === "direct" || c.competitorType === "partial") &&
      (c.confidenceLevel === "high" || c.confidenceLevel === "medium"),
  );
}

/**
 * Extract candidate sources from an emerging-players result. We keep
 * every category the agent surfaces (emerging direct threats, adjacent
 * players, substitutes, ecosystem partners) because all four are
 * worth watching for a strategy engagement — but we filter on
 * confidence so low-confidence guesses don't fill the monitor with
 * noise. High-threat players are surfaced first so they get priority
 * if the source cap is hit.
 */
export function emergingPlayersToSourceCandidates(
  result: ResearchResult<"emergingPlayers"> | undefined,
): SourceCandidate[] {
  if (!result?.data?.emergingPlayers?.length) return [];
  return filterEmergingPlayers(result.data.emergingPlayers).map((p) => ({
    url: p.websiteUrl,
    name: p.name,
  }));
}

const THREAT_RANK: Record<EmergingPlayer["threatLevel"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function filterEmergingPlayers(
  players: EmergingPlayersResult["emergingPlayers"],
): EmergingPlayer[] {
  const filtered = players.filter(
    (p) =>
      p?.websiteUrl &&
      (p.confidenceLevel === "high" || p.confidenceLevel === "medium"),
  );
  // Sort by threat level (high first) so the source cap, when hit,
  // keeps the most strategically relevant emerging players.
  return [...filtered].sort(
    (a, b) => THREAT_RANK[b.threatLevel] - THREAT_RANK[a.threatLevel],
  );
}

export function clampInterval(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_INTERVAL_MINUTES;
  return Math.max(
    MIN_INTERVAL_MINUTES,
    Math.min(MAX_INTERVAL_MINUTES, Math.floor(value)),
  );
}

export function nextRunAt(
  fromIso: string,
  intervalMinutes: number,
): string {
  const base = new Date(fromIso);
  const ms = clampInterval(intervalMinutes) * 60 * 1000;
  return new Date(base.getTime() + ms).toISOString();
}

export function isMonitorDue(monitor: Monitor, nowMs: number): boolean {
  if (!monitor.enabled) return false;
  if (monitor.sources.length === 0) return false;
  return new Date(monitor.nextRunAt).getTime() <= nowMs;
}
