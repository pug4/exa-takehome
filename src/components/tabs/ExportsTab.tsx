"use client";

import { useState } from "react";
import type { Engagement } from "@/types/engagement";
import type { ResultsByAgent } from "@/lib/useEngagementStream";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

interface ExportsTabProps {
  engagement: Engagement;
  results: ResultsByAgent;
}

interface ExportItem {
  format: string;
  label: string;
  description: string;
  ready: boolean;
}

export function ExportsTab({ engagement, results }: ExportsTabProps) {
  const [copyTarget, setCopyTarget] = useState<string | null>(null);

  const items: ExportItem[] = [
    {
      format: "memo",
      label: "Full memo (Markdown)",
      description: "Complete consulting memo with all sections.",
      ready: Boolean(results.memo?.data?.markdown),
    },
    {
      format: "one-slide",
      label: "One-slide summary (Markdown)",
      description: "Client-ready Markdown slide for a deck.",
      ready: Boolean(results.oneSlideSummary?.data?.markdown),
    },
    {
      format: "competitors",
      label: "Competitors (CSV)",
      description: "Direct, partial, and possible competitors.",
      ready: Boolean(results.competitors?.data?.competitors?.length),
    },
    {
      format: "emergingPlayers",
      label: "Emerging players (CSV)",
      description: "Adjacent, substitute, and ecosystem players.",
      ready: Boolean(results.emergingPlayers?.data?.emergingPlayers?.length),
    },
    {
      format: "marketSignals",
      label: "Market signals (CSV)",
      description: "Recent funding, M&A, regulation, and trends.",
      ready: Boolean(results.marketSignals?.data?.marketSignals?.length),
    },
    {
      format: "customerSegments",
      label: "Customer segments (CSV)",
      description: "Buyer types, pain points, and triggers.",
      ready: Boolean(results.customerSegments?.data?.customerSegments?.length),
    },
    {
      format: "discoveryQuestions",
      label: "Discovery questions (CSV)",
      description: "First-call discovery question bank.",
      ready: Boolean(
        results.discoveryQuestions?.data?.recommendedQuestions?.length,
      ),
    },
    {
      format: "expertCalls",
      label: "Expert-call targets (CSV)",
      description: "Target profiles with sample questions.",
      ready: Boolean(results.expertCalls?.data?.expertCallTargets?.length),
    },
  ];

  const anyReady = items.some((item) => item.ready);
  if (!anyReady) {
    return (
      <EmptyState
        title="Nothing to export yet"
        description="Run the pipeline to generate memo, slide, and CSV exports."
      />
    );
  }

  const handleCopySlide = async (): Promise<void> => {
    const markdown = results.oneSlideSummary?.data?.markdown;
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopyTarget("one-slide");
    setTimeout(() => setCopyTarget(null), 2000);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => {
          const href = `/api/engagements/${engagement.id}/export?format=${item.format}`;
          return (
            <Card key={item.format}>
              <CardBody className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-medium">{item.label}</h4>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {item.description}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.format === "one-slide" && item.ready && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCopySlide}
                      type="button"
                    >
                      {copyTarget === "one-slide" ? "Copied!" : "Copy"}
                    </Button>
                  )}
                  {item.ready ? (
                    <a
                      href={href}
                      download
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-xs font-medium tracking-tight transition-colors hover:bg-[var(--surface-alt)]"
                    >
                      Download
                    </a>
                  ) : (
                    <Button size="sm" variant="ghost" disabled type="button">
                      Pending
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
