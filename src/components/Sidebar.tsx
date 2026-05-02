"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Engagement } from "@/types/engagement";
import { Button } from "@/components/ui/Button";
import { NewEngagementModal } from "@/components/NewEngagementModal";
import { EngagementCard } from "@/components/EngagementCard";
import { cn } from "@/lib/cn";

const POLL_INTERVAL_MS = 5000;

export function Sidebar() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const fetchEngagements = useCallback(async () => {
    try {
      const response = await fetch("/api/engagements", { cache: "no-store" });
      if (!response.ok) return;
      const json = (await response.json()) as { engagements: Engagement[] };
      setEngagements(json.engagements);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load + polling. setState happens after async resolution.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEngagements();
    const interval = setInterval(fetchEngagements, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchEngagements]);

  const handleCreated = useCallback(
    (engagement: Engagement): void => {
      setEngagements((prev) => [engagement, ...prev]);
      setShowNew(false);
      router.push(`/engagements/${engagement.id}?run=1`);
    },
    [router],
  );

  const activeId = params?.id;

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-alt)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
        <Link
          href="/engagements"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span
            className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] shadow-exa"
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M2.5 12.5V3.5h3l2.5 5 2.5-5h3v9h-2.5V7.5L8.5 12.5H7L4.5 7.5v5z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="text-sm">Market Map</span>
        </Link>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setShowNew(true)}
          icon={<PlusIcon />}
          aria-label="New engagement"
        >
          New
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && (
          <div className="px-3 py-6 text-center text-xs text-[var(--muted)]">
            Loading…
          </div>
        )}
        {!loading && engagements.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-[var(--muted)]">
            No engagements yet. Click <strong>New</strong> to create one.
          </div>
        )}
        <ul className="space-y-1">
          {engagements.map((engagement) => (
            <li key={engagement.id}>
              <EngagementCard
                engagement={engagement}
                active={activeId === engagement.id}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-[var(--border)] px-2 py-2">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
            pathname === "/settings"
              ? "bg-[var(--surface)] text-[var(--foreground)] shadow-exa"
              : "text-[var(--muted)] hover:bg-[var(--surface-deep)] hover:text-[var(--foreground)]",
          )}
        >
          <SettingsIcon />
          Settings
        </Link>
      </div>

      <div className="border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--muted)]">
        Powered by Exa /search
      </div>

      <NewEngagementModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={handleCreated}
      />
    </aside>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
