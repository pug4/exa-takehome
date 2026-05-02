"use client";

import type { AgentEvent, AgentType, Engagement } from "@/types/engagement";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AgentStatusBadge } from "@/components/AgentStatusBadge";
import { AGENT_LABELS } from "@/lib/agents";
import { getEnabledAgents } from "@/lib/engagements";

interface OverviewTabProps {
  engagement: Engagement;
  events: AgentEvent[];
  isRunning: boolean;
}

export function OverviewTab({ engagement, events, isRunning }: OverviewTabProps) {
  const recentEvents = events.slice(-30).reverse();
  const enabledAgents = getEnabledAgents(engagement);
  const customTabs = engagement.customTabs ?? [];
  const hasAnyTabs = enabledAgents.length > 0 || customTabs.length > 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Engagement
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Project name">
                {engagement.projectName ?? "—"}
              </Row>
              <Row label="Client">{engagement.clientName ?? "—"}</Row>
              <Row label="URL">
                <a
                  href={engagement.clientUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-[var(--info)] hover:underline"
                >
                  {engagement.clientUrl}
                </a>
              </Row>
              <Row label="Industry">{engagement.industry ?? "—"}</Row>
              <Row label="Geography">{engagement.geography ?? "—"}</Row>
              <Row label="Created">
                {new Date(engagement.createdAt).toLocaleString()}
              </Row>
            </dl>
            {engagement.notes && (
              <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-alt)] p-3 text-xs text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">
                  Notes:
                </span>{" "}
                {engagement.notes}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Pipeline status
            </h3>
            {!hasAnyTabs ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                No tabs enabled yet. Use <strong>Add tab</strong> in the tab
                bar to add a built-in research tab or write a custom prompt.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {enabledAgents.map((agent) => (
                  <li
                    key={agent}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{AGENT_LABELS[agent]}</span>
                    <AgentStatusBadge status={engagement.agents[agent]} />
                  </li>
                ))}
                {customTabs.map((tab) => (
                  <li
                    key={tab.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="rounded-sm bg-[var(--accent)]/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)]"
                        aria-hidden
                      >
                        Custom
                      </span>
                      <span className="truncate">{tab.label}</span>
                    </span>
                    <AgentStatusBadge status={tab.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Activity
            </h3>
            {isRunning && (
              <Badge tone="info">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--info)] pulse-dot" />
                Running
              </Badge>
            )}
          </div>
          {recentEvents.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              No activity yet. Click <strong>Run pipeline</strong> to start.
            </p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1">
              {recentEvents.map((event, index) => (
                <li
                  key={`${event.timestamp}-${index}`}
                  className="flex items-start gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-[var(--surface-alt)]"
                >
                  <time className="w-20 shrink-0 font-mono text-[10px] text-[var(--muted)]">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </time>
                  <span
                    className={
                      event.type === "agent_failed" ||
                      event.type === "pipeline_failed"
                        ? "text-[var(--danger)]"
                        : event.type === "agent_completed" ||
                            event.type === "pipeline_completed"
                          ? "text-[var(--success)]"
                          : "text-[var(--foreground)]"
                    }
                  >
                    <span className="font-medium">
                      {event.agent === "orchestrator"
                        ? "Pipeline"
                        : (AGENT_LABELS[event.agent as AgentType] ?? event.agent)}
                    </span>{" "}
                    — {event.message ?? event.type}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-right">{children}</dd>
    </div>
  );
}
