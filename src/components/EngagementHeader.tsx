"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Engagement } from "@/types/engagement";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getDomain } from "@/lib/url";

interface EngagementHeaderProps {
  engagement: Engagement;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
}

const STATUS_TONE = {
  created: "muted",
  researching: "info",
  complete: "success",
  failed: "danger",
} as const;

export function EngagementHeader({
  engagement,
  isRunning,
  onRun,
  onStop,
}: EngagementHeaderProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (): Promise<void> => {
    if (!confirm("Delete this engagement? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await fetch(`/api/engagements/${engagement.id}`, { method: "DELETE" });
      router.push("/engagements");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-8 py-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {engagement.projectName ||
              engagement.clientName ||
              getDomain(engagement.clientUrl)}
          </h1>
          <Badge tone={STATUS_TONE[engagement.status]}>{engagement.status}</Badge>
        </div>
        <a
          href={engagement.clientUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block truncate text-xs font-medium text-[var(--accent)] hover:underline"
        >
          {engagement.clientUrl} ↗
        </a>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          loading={deleting}
        >
          Delete
        </Button>
        {isRunning ? (
          <Button variant="secondary" size="sm" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={onRun} icon={<RunIcon />}>
            {Object.values(engagement.agents).some((s) => s === "complete")
              ? "Re-run pipeline"
              : "Run pipeline"}
          </Button>
        )}
      </div>
    </header>
  );
}

function RunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <path d="M8 5v14l11-7-11-7z" />
    </svg>
  );
}
