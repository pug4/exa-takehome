import type { Monitor, MonitorRunSummary } from "@/types/monitoring";
import { runMonitor } from "./crawler";
import { isMonitorDue } from "./sources";
import { listAllMonitors } from "./store";

/** Maximum number of monitors to run in parallel during a single tick. */
const MONITOR_CONCURRENCY = 2;
/** Hard cap on total time per tick so the API stays well under Vercel
 * function limits even if a few monitors stall. */
const TICK_BUDGET_MS = 60_000;

export interface TickResult {
  startedAt: string;
  completedAt: string;
  considered: number;
  ran: number;
  totalNewFindings: number;
  summaries: MonitorRunSummary[];
}

/**
 * Run every monitor whose `nextRunAt` is in the past. Safe to call on a
 * cron, on user-driven beacon pings, or manually. Honours a hard time
 * budget so a single tick can't run forever — anything still due will be
 * picked up on the next tick.
 */
export async function runDueMonitors(now: Date = new Date()): Promise<TickResult> {
  const startedAt = now.toISOString();
  const startMs = now.getTime();
  const allMonitors = await listAllMonitors();
  const due = allMonitors.filter((monitor) => isMonitorDue(monitor, startMs));

  const summaries: MonitorRunSummary[] = [];
  let totalNewFindings = 0;

  await runWithBudget(
    due,
    MONITOR_CONCURRENCY,
    TICK_BUDGET_MS,
    startMs,
    async (monitor) => {
      try {
        const { summary, newFindings } = await runMonitor(monitor);
        summaries.push(summary);
        totalNewFindings += newFindings.length;
      } catch (error) {
        // Log loudly but don't take down the whole tick — the next pass
        // will retry this monitor.
        console.error(
          `[monitor.scheduler] failed to run monitor for engagement ${monitor.engagementId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    },
  );

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    considered: allMonitors.length,
    ran: summaries.length,
    totalNewFindings,
    summaries,
  };
}

async function runWithBudget<T>(
  items: readonly T[],
  concurrency: number,
  budgetMs: number,
  startMs: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, concurrency);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        if (Date.now() - startMs > budgetMs) return;
        const idx = cursor;
        cursor += 1;
        if (idx >= items.length) return;
        await worker(items[idx]);
      }
    },
  );
  await Promise.all(workers);
}

/**
 * Helper for callers that just want to know whether anything is due, e.g.
 * the front-end beacon deciding whether to fire a tick at all.
 */
export function selectDueMonitors(
  monitors: readonly Monitor[],
  now = Date.now(),
): Monitor[] {
  return monitors.filter((monitor) => isMonitorDue(monitor, now));
}
