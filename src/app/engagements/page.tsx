import Link from "next/link";
import { listEngagements } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationsFeed } from "@/components/monitoring/NotificationsFeed";
import { getEnabledAgents } from "@/lib/engagements";
import { getDomain } from "@/lib/url";

export const dynamic = "force-dynamic";

export default async function EngagementsDashboardPage() {
  const engagements = await listEngagements();

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-12">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
          Workspace
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Consulting engagements
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Drop a client URL to spin up a research engagement. Multiple
          Exa-powered agents run in parallel to produce a competitive
          landscape, market signals, customer segments, discovery questions,
          expert-call targets, and a first-pass consulting memo.
        </p>
      </header>

      {engagements.length > 0 && (
        <section className="mb-10">
          <NotificationsFeed />
        </section>
      )}

      {engagements.length === 0 ? (
        <EmptyState
          title="No engagements yet"
          description="Click New in the sidebar to create your first engagement from a client URL."
        />
      ) : (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Engagements
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {engagements.map((engagement) => {
              const enabled = getEnabledAgents(engagement);
              const customTabs = engagement.customTabs ?? [];
              const completed =
                enabled.filter(
                  (agent) => engagement.agents[agent] === "complete",
                ).length +
                customTabs.filter((tab) => tab.status === "complete").length;
              const failed =
                enabled.filter(
                  (agent) => engagement.agents[agent] === "failed",
                ).length +
                customTabs.filter((tab) => tab.status === "failed").length;
              const total = enabled.length + customTabs.length;
              const tone =
                engagement.status === "complete"
                  ? "success"
                  : engagement.status === "researching"
                    ? "info"
                    : engagement.status === "failed"
                      ? "danger"
                      : "muted";
              return (
                <Link
                  key={engagement.id}
                  href={`/engagements/${engagement.id}`}
                  className="group block"
                >
                  <Card className="transition-all group-hover:-translate-y-0.5 group-hover:border-[var(--border-strong)] group-hover:shadow-exa-lg">
                    <CardBody>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold tracking-tight">
                            {engagement.projectName ||
                              engagement.clientName ||
                              getDomain(engagement.clientUrl)}
                          </h3>
                          <p className="mt-1 truncate text-xs text-[var(--muted)]">
                            {getDomain(engagement.clientUrl)}
                          </p>
                        </div>
                        <Badge tone={tone}>{engagement.status}</Badge>
                      </div>

                      <div className="mt-5 flex items-center justify-between text-xs text-[var(--muted)]">
                        <span>
                          {completed}/{total} tabs complete
                          {failed > 0 ? ` · ${failed} failed` : ""}
                        </span>
                        <span>
                          {new Date(engagement.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--surface-alt)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all"
                          style={{
                            width:
                              total === 0
                                ? "0%"
                                : `${(completed / total) * 100}%`,
                          }}
                        />
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
