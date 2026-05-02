/**
 * Compact "x m ago" / "y h ago" style relative-time formatter for activity
 * feeds. Avoids pulling in a date library for a single use case.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelativeTime(
  iso: string | Date | undefined,
  nowMs: number = Date.now(),
): string {
  if (!iso) return "";
  const target = typeof iso === "string" ? new Date(iso) : iso;
  const time = target.getTime();
  if (Number.isNaN(time)) return "";
  const diffMs = nowMs - time;
  if (diffMs < 0) return "in the future";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 30) return "just now";
  if (seconds < MINUTE) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / MINUTE);
  if (minutes < HOUR / MINUTE) return `${minutes}m ago`;
  const hours = Math.floor(seconds / HOUR);
  if (hours < DAY / HOUR) return `${hours}h ago`;
  const days = Math.floor(seconds / DAY);
  if (days < WEEK / DAY) return `${days}d ago`;
  const weeks = Math.floor(seconds / WEEK);
  if (weeks < 5) return `${weeks}w ago`;
  return target.toLocaleDateString();
}

export function formatRelativeFuture(
  iso: string | Date | undefined,
  nowMs: number = Date.now(),
): string {
  if (!iso) return "";
  const target = typeof iso === "string" ? new Date(iso) : iso;
  const time = target.getTime();
  if (Number.isNaN(time)) return "";
  const diffMs = time - nowMs;
  if (diffMs <= 0) return "due";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < MINUTE) return `in ${seconds}s`;
  const minutes = Math.floor(seconds / MINUTE);
  if (minutes < HOUR / MINUTE) return `in ${minutes}m`;
  const hours = Math.floor(seconds / HOUR);
  if (hours < DAY / HOUR) return `in ${hours}h`;
  const days = Math.floor(seconds / DAY);
  return `in ${days}d`;
}
