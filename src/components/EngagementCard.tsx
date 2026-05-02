"use client";

import Link from "next/link";
import type { Engagement } from "@/types/engagement";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { getEnabledAgents } from "@/lib/engagements";
import { getDomain } from "@/lib/url";

const STATUS_TONE: Record<
  Engagement["status"],
  React.ComponentProps<typeof Badge>["tone"]
> = {
  created: "muted",
  researching: "info",
  complete: "success",
  failed: "danger",
};

const STATUS_LABEL: Record<Engagement["status"], string> = {
  created: "draft",
  researching: "researching",
  complete: "ready",
  failed: "failed",
};

interface EngagementCardProps {
  engagement: Engagement;
  active?: boolean;
}

export function EngagementCard({ engagement, active }: EngagementCardProps) {
  const enabledAgents = getEnabledAgents(engagement);
  const customTabs = engagement.customTabs ?? [];
  const completedCount =
    enabledAgents.filter((agent) => engagement.agents[agent] === "complete")
      .length +
    customTabs.filter((tab) => tab.status === "complete").length;
  const totalCount = enabledAgents.length + customTabs.length;

  return (
    <Link
      href={`/engagements/${engagement.id}`}
      className={cn(
        "group block rounded-lg border px-3 py-2 transition-all",
        active
          ? "border-[var(--border)] bg-[var(--surface)] shadow-exa"
          : "border-transparent hover:bg-[var(--surface-deep)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {engagement.projectName ||
              engagement.clientName ||
              getDomain(engagement.clientUrl)}
          </p>
          <p className="truncate text-[11px] text-[var(--muted)]">
            {getDomain(engagement.clientUrl)}
          </p>
        </div>
        <Badge tone={STATUS_TONE[engagement.status]}>
          {STATUS_LABEL[engagement.status]}
        </Badge>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-[var(--muted)]">
          {completedCount}/{totalCount} tabs
        </span>
        <span className="text-[10px] text-[var(--muted)]">
          {new Date(engagement.createdAt).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}
