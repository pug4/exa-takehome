/**
 * Continuous-monitoring types. The monitor for an engagement keeps a list of
 * source URLs (the client website + competitors) that an Exa-powered crawler
 * agent revisits on a fixed cadence. Each crawl can produce one or more
 * `MonitorFinding`s — pieces of news or fresh content discovered since the
 * previous run — which power both the engagement-level Monitoring tab and
 * the cross-engagement notifications feed on the front page.
 */

/**
 * What this source represents in the engagement's competitive landscape.
 *
 * - `client` — the engagement's own company. Always exactly one per monitor.
 * - `competitor` — a head-on or partial competitor (from `knownCompetitors`
 *   or the competitor-discovery agent).
 * - `emerging` — emerging direct threats, adjacent players, substitutes,
 *   and ecosystem partners surfaced by the emerging-players agent. Tracked
 *   separately so the UI can group "established competitors" vs
 *   "emerging / adjacent" sources independently.
 * - `other` — anything else the user manually adds.
 */
export type MonitorSourceKind = "client" | "competitor" | "emerging" | "other";

export interface MonitorSource {
  id: string;
  /** Canonical (https://...) URL with no trailing slash; deduped by domain. */
  url: string;
  /** Human-readable label, e.g. company name. Falls back to the domain. */
  label: string;
  kind: MonitorSourceKind;
  /** ISO timestamp the source was added to the monitor. */
  addedAt: string;
  /** Last time the crawler successfully scanned this source, if any. */
  lastCrawledAt?: string;
}

export interface Monitor {
  engagementId: string;
  enabled: boolean;
  sources: MonitorSource[];
  /** Cadence between automatic crawls. Minimum is enforced server-side. */
  intervalMinutes: number;
  /** Last time the scheduler ran this monitor. */
  lastRunAt?: string;
  /** Earliest time the scheduler should run this monitor again. */
  nextRunAt: string;
  /** Findings emitted by the most recent run. */
  lastRunFindings: number;
  totalFindings: number;
  createdAt: string;
  updatedAt: string;
}

export type MonitorFindingKind =
  | "news"
  | "announcement"
  | "product_launch"
  | "funding"
  | "hiring"
  | "partnership"
  | "regulation"
  | "page_change"
  | "other";

export type MonitorFindingSeverity = "info" | "update" | "alert";

export interface MonitorFinding {
  id: string;
  engagementId: string;
  /** Identifier of the run that surfaced this finding. */
  monitorRunId: string;
  /** Snapshot of the source as it was when the finding was discovered. */
  source: MonitorSource;
  title: string;
  summary: string;
  /** Canonical URL of the finding (article, blog post, press release). */
  url: string;
  publishedDate?: string | null;
  kind: MonitorFindingKind;
  severity: MonitorFindingSeverity;
  discoveredAt: string;
  read: boolean;
}

export interface MonitorRunSummary {
  engagementId: string;
  monitorRunId: string;
  startedAt: string;
  completedAt: string;
  sourcesScanned: number;
  newFindings: number;
  errors: Array<{ sourceUrl: string; message: string }>;
}

export interface NotificationFeedItem {
  finding: MonitorFinding;
  engagement: {
    id: string;
    /** Display name (project name → client name → domain). */
    name: string;
    clientUrl: string;
  };
}
