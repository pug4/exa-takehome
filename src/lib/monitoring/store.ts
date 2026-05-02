import type {
  Monitor,
  MonitorFinding,
  MonitorRunSummary,
} from "@/types/monitoring";
import { getKvAdapter } from "../db";

/**
 * Persistence layer for the continuous-monitoring feature.
 *
 * Key shape (kept self-documenting so cascade-deletes in the engagement
 * store can sweep them with a `monitor:{eid}:*` scan):
 *
 *   monitor:{eid}                            → Monitor record
 *   monitor:{eid}:finding:{fid}              → MonitorFinding record
 *   monitor:{eid}:findings:index             → zset of finding ids by discoveredAt
 *   monitor:{eid}:seen                       → string[] of URLs already surfaced
 *   monitor:{eid}:runs                       → list of MonitorRunSummary entries
 *
 *   monitor:index                            → zset of engagement ids by nextRunAt
 *   monitor:findings:global                  → zset of "{eid}:{fid}" by discoveredAt
 */

const MONITOR_INDEX_KEY = "monitor:index";
const GLOBAL_FINDINGS_KEY = "monitor:findings:global";
const SEEN_URLS_LIMIT = 500;
const RUNS_LOG_LIMIT = 50;

const monitorKey = (engagementId: string): string =>
  `monitor:${engagementId}`;
const findingKey = (engagementId: string, findingId: string): string =>
  `monitor:${engagementId}:finding:${findingId}`;
const findingsIndexKey = (engagementId: string): string =>
  `monitor:${engagementId}:findings:index`;
const seenUrlsKey = (engagementId: string): string =>
  `monitor:${engagementId}:seen`;
const runsLogKey = (engagementId: string): string =>
  `monitor:${engagementId}:runs`;

const globalFeedMember = (engagementId: string, findingId: string): string =>
  `${engagementId}:${findingId}`;

export async function saveMonitor(monitor: Monitor): Promise<void> {
  const kv = getKvAdapter();
  await kv.set(monitorKey(monitor.engagementId), monitor);
  await kv.zadd(
    MONITOR_INDEX_KEY,
    new Date(monitor.nextRunAt).getTime(),
    monitor.engagementId,
  );
}

export async function getMonitor(
  engagementId: string,
): Promise<Monitor | null> {
  return getKvAdapter().get<Monitor>(monitorKey(engagementId));
}

/**
 * List every monitor in the workspace. Used by the scheduler to find work.
 * Order is descending by `nextRunAt` (most-overdue first when multiple are
 * past due), but callers should still filter by `nextRunAt <= now` and
 * `enabled` themselves.
 */
export async function listAllMonitors(): Promise<Monitor[]> {
  const kv = getKvAdapter();
  const ids = await kv.zrangeDesc(MONITOR_INDEX_KEY);
  if (ids.length === 0) return [];
  const monitors = await Promise.all(
    ids.map((id) => kv.get<Monitor>(monitorKey(id))),
  );
  return monitors.filter((m): m is Monitor => Boolean(m));
}

export async function deleteMonitor(engagementId: string): Promise<void> {
  const kv = getKvAdapter();
  await kv.del(monitorKey(engagementId));
  await kv.zrem(MONITOR_INDEX_KEY, engagementId);
}

export async function getSeenUrls(engagementId: string): Promise<string[]> {
  const kv = getKvAdapter();
  return (await kv.get<string[]>(seenUrlsKey(engagementId))) ?? [];
}

export async function recordSeenUrls(
  engagementId: string,
  newUrls: string[],
): Promise<void> {
  if (newUrls.length === 0) return;
  const existing = await getSeenUrls(engagementId);
  const merged = mergeAndCap(existing, newUrls, SEEN_URLS_LIMIT);
  await getKvAdapter().set(seenUrlsKey(engagementId), merged);
}

export async function saveFinding(finding: MonitorFinding): Promise<void> {
  const kv = getKvAdapter();
  const score = new Date(finding.discoveredAt).getTime();

  await kv.set(findingKey(finding.engagementId, finding.id), finding);
  await kv.zadd(findingsIndexKey(finding.engagementId), score, finding.id);
  await kv.zadd(
    GLOBAL_FINDINGS_KEY,
    score,
    globalFeedMember(finding.engagementId, finding.id),
  );
}

export async function getFinding(
  engagementId: string,
  findingId: string,
): Promise<MonitorFinding | null> {
  return getKvAdapter().get<MonitorFinding>(
    findingKey(engagementId, findingId),
  );
}

export async function listFindings(
  engagementId: string,
  limit = 50,
): Promise<MonitorFinding[]> {
  const kv = getKvAdapter();
  const ids = await kv.zrangeDescLimit(findingsIndexKey(engagementId), limit);
  if (ids.length === 0) return [];
  const findings = await Promise.all(
    ids.map((id) => kv.get<MonitorFinding>(findingKey(engagementId, id))),
  );
  return findings.filter((f): f is MonitorFinding => Boolean(f));
}

export interface GlobalFinding {
  engagementId: string;
  finding: MonitorFinding;
}

/**
 * Cross-engagement notifications feed, sorted newest-first. Bounded by
 * `limit` so the front-page widget never has to materialise the entire
 * history. Returns the engagement id alongside each finding so callers can
 * join with the engagement record without a follow-up scan.
 */
export async function listGlobalFindings(
  limit = 30,
): Promise<GlobalFinding[]> {
  const kv = getKvAdapter();
  const members = await kv.zrangeDescLimit(GLOBAL_FINDINGS_KEY, limit);
  if (members.length === 0) return [];

  const parsed = members
    .map((member) => {
      const idx = member.indexOf(":");
      if (idx <= 0) return null;
      const engagementId = member.slice(0, idx);
      const findingId = member.slice(idx + 1);
      if (!engagementId || !findingId) return null;
      return { engagementId, findingId };
    })
    .filter(
      (entry): entry is { engagementId: string; findingId: string } =>
        entry !== null,
    );

  const findings = await Promise.all(
    parsed.map(async ({ engagementId, findingId }) => {
      const finding = await kv.get<MonitorFinding>(
        findingKey(engagementId, findingId),
      );
      return finding ? { engagementId, finding } : null;
    }),
  );
  return findings.filter((f): f is GlobalFinding => f !== null);
}

export async function markFindingRead(
  engagementId: string,
  findingId: string,
  read = true,
): Promise<MonitorFinding | null> {
  const finding = await getFinding(engagementId, findingId);
  if (!finding) return null;
  if (finding.read === read) return finding;
  const updated: MonitorFinding = { ...finding, read };
  await getKvAdapter().set(findingKey(engagementId, findingId), updated);
  return updated;
}

/**
 * Mark every unread finding for an engagement as read. Returns the count of
 * findings that were updated. Used by the "Mark all read" button on the
 * Monitoring tab.
 */
export async function markAllFindingsRead(
  engagementId: string,
): Promise<number> {
  const kv = getKvAdapter();
  const findings = await listFindings(engagementId, 500);
  const unread = findings.filter((f) => !f.read);
  if (unread.length === 0) return 0;
  await Promise.all(
    unread.map(async (finding) => {
      const updated: MonitorFinding = { ...finding, read: true };
      await kv.set(findingKey(engagementId, finding.id), updated);
    }),
  );
  return unread.length;
}

export async function appendRunSummary(
  summary: MonitorRunSummary,
): Promise<void> {
  await getKvAdapter().rpush(runsLogKey(summary.engagementId), summary);
}

export async function listRecentRuns(
  engagementId: string,
  limit = RUNS_LOG_LIMIT,
): Promise<MonitorRunSummary[]> {
  const kv = getKvAdapter();
  const all = await kv.lrange<MonitorRunSummary>(
    runsLogKey(engagementId),
    0,
    -1,
  );
  return all.slice(-limit).reverse();
}

function mergeAndCap(
  existing: string[],
  next: string[],
  cap: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...next, ...existing]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= cap) break;
  }
  return out;
}
