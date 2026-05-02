import type { Engagement } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import type { Monitor, MonitorSourceKind } from "@/types/monitoring";
import {
  buildInitialSources,
  clampInterval,
  competitorsToSourceCandidates,
  DEFAULT_INTERVAL_MINUTES,
  emergingPlayersToSourceCandidates,
  mergeMonitorSources,
  nextRunAt,
  type SourceCandidate,
} from "./sources";
import { getMonitor, saveMonitor } from "./store";

/**
 * Bootstrap a default monitor for a freshly-created engagement. The first
 * run is scheduled `intervalMinutes` minutes from now to avoid hammering
 * Exa during the initial pipeline burst — the user can hit "Run now" if
 * they want immediate results.
 */
export async function createMonitorForEngagement(
  engagement: Engagement,
  options: { intervalMinutes?: number } = {},
): Promise<Monitor> {
  const intervalMinutes = clampInterval(
    options.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES,
  );
  const now = new Date().toISOString();
  const monitor: Monitor = {
    engagementId: engagement.id,
    enabled: true,
    sources: buildInitialSources(engagement),
    intervalMinutes,
    nextRunAt: nextRunAt(now, intervalMinutes),
    lastRunFindings: 0,
    totalFindings: 0,
    createdAt: now,
    updatedAt: now,
  };
  await saveMonitor(monitor);
  return monitor;
}

/**
 * Add freshly-discovered competitors to an engagement's monitor (after
 * the competitor-discovery agent finishes). Only direct/partial
 * competitors with medium-or-better confidence are added, and the merge
 * preserves any user edits that were made between runs.
 *
 * Returns the count of newly added sources, or 0 if no monitor exists or
 * nothing new was added — callers can use this to surface a "monitoring
 * N new competitor sites" hint in the UI.
 */
export async function syncMonitorWithCompetitors(
  engagementId: string,
  competitorsResult: ResearchResult<"competitors"> | undefined,
): Promise<number> {
  return syncMonitorSources(
    engagementId,
    competitorsToSourceCandidates(competitorsResult),
    "competitor",
  );
}

/**
 * Add freshly-discovered emerging players (emerging direct threats,
 * adjacent players, substitutes, ecosystem partners) to an engagement's
 * monitor. Filters by confidence so low-confidence guesses don't blow
 * up the monitor's source list, and dedupes against anything already
 * being tracked — a player that's also flagged as a competitor keeps
 * its `competitor` kind because it was added first.
 */
export async function syncMonitorWithEmergingPlayers(
  engagementId: string,
  emergingPlayersResult: ResearchResult<"emergingPlayers"> | undefined,
): Promise<number> {
  return syncMonitorSources(
    engagementId,
    emergingPlayersToSourceCandidates(emergingPlayersResult),
    "emerging",
  );
}

/**
 * Shared "merge new candidates of a given kind into the saved monitor"
 * step. Callers above narrow the input to a specific agent's output;
 * this helper handles the load → merge → save round-trip and bails out
 * cheaply when there's nothing to do.
 */
async function syncMonitorSources(
  engagementId: string,
  candidates: SourceCandidate[],
  kind: MonitorSourceKind,
): Promise<number> {
  if (candidates.length === 0) return 0;

  const monitor = await getMonitor(engagementId);
  if (!monitor) return 0;

  const { sources, addedCount } = mergeMonitorSources(
    monitor.sources,
    candidates,
    kind,
  );
  if (addedCount === 0) return 0;

  const updated: Monitor = {
    ...monitor,
    sources,
    updatedAt: new Date().toISOString(),
  };
  await saveMonitor(updated);
  return addedCount;
}
