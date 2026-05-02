"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { NotificationFeedItem } from "@/types/monitoring";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/relativeTime";
import { getDomain } from "@/lib/url";
import {
  FindingKindChip,
  FindingSeverityChip,
  SourceKindChip,
} from "./FindingChips";

interface NotificationsResponse {
  items: NotificationFeedItem[];
  unreadCount: number;
  total: number;
}

const POLL_INTERVAL_MS = 15_000;

interface NotificationsFeedProps {
  /** Maximum items to display. Cards beyond this are accessible via the
   * engagement-level Monitoring tab. */
  limit?: number;
}

/**
 * The cross-engagement activity feed shown on the front page. Auto-polls
 * `/api/notifications` so any findings discovered by the background
 * scheduler appear without a page refresh.
 */
export function NotificationsFeed({ limit = 12 }: NotificationsFeedProps) {
  const [items, setItems] = useState<NotificationFeedItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // `hasLoaded` flips to true after the first fetch resolves; we use it
  // to suppress the "loading" placeholder on subsequent polls so the
  // feed doesn't flicker. State (not a ref) so we can read it safely
  // during render under React 19's strict rules.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/notifications?limit=${limit}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const json = (await response.json()) as NotificationsResponse;
      setItems(json.items);
      setUnreadCount(json.unreadCount);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setHasLoaded(true);
    }
  }, [limit]);

  useEffect(() => {
    // Initial load runs the fetch immediately, then we poll on an
    // interval so the feed stays current while the user is on the page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFeed();
    const interval = setInterval(fetchFeed, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  const showInitialLoading = !hasLoaded;

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Live monitoring activity
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Findings from agents continuously crawling each engagement&apos;s
              client and competitor sites.
            </p>
          </div>
          {unreadCount > 0 && (
            <Badge tone="info">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--info)] pulse-dot" />
              {unreadCount} new
            </Badge>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </p>
        )}

        <div className="mt-4">
          {showInitialLoading ? (
            <p className="px-2 py-6 text-center text-xs text-[var(--muted)]">
              Loading recent activity…
            </p>
          ) : items.length === 0 ? (
            <EmptyFeed />
          ) : (
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item.finding.id}>
                  <FeedRow item={item} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function EmptyFeed() {
  return (
    <div className="rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-alt)] px-4 py-8 text-center">
      <p className="text-xs font-medium">No activity yet</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Once an engagement runs its monitor, fresh news and site updates will
        stream in here automatically.
      </p>
    </div>
  );
}

function FeedRow({ item }: { item: NotificationFeedItem }) {
  const { finding, engagement } = item;
  const domain = getDomain(finding.url);
  const accent = !finding.read;

  return (
    <Link
      href={`/engagements/${engagement.id}?tab=monitoring`}
      className={`group flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors ${
        accent
          ? "border-[var(--accent)]/30 bg-[var(--accent)]/[0.04] hover:bg-[var(--accent)]/[0.07]"
          : "border-transparent hover:bg-[var(--surface-alt)]"
      }`}
    >
      <span
        aria-hidden
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          accent ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--foreground)]">
            {engagement.name}
          </span>
          <span className="text-[11px] text-[var(--muted)]">·</span>
          <SourceKindChip kind={finding.source.kind} />
          <span className="truncate text-[11px] text-[var(--muted)]">
            {finding.source.label}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">
          {finding.title}
        </p>
        {finding.summary && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
            {finding.summary}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <FindingKindChip kind={finding.kind} />
          {finding.severity !== "info" && (
            <FindingSeverityChip severity={finding.severity} />
          )}
          <a
            href={finding.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="ml-auto truncate font-medium text-[var(--accent)] hover:underline"
          >
            {domain} ↗
          </a>
          <span className="font-mono text-[10px]">
            {formatRelativeTime(finding.discoveredAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}
