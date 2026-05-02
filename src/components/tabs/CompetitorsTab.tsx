"use client";

import type { AgentStatus } from "@/types/engagement";
import type { Competitor, ResearchResult } from "@/types/research";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EvidenceList } from "@/components/EvidenceList";
import { AgentResultEmpty } from "@/components/AgentResultEmpty";
import { getDomain } from "@/lib/url";

interface CompetitorsTabProps {
  status: AgentStatus;
  result?: ResearchResult<"competitors">;
}

const TYPE_TONE = {
  direct: "danger",
  partial: "warning",
  low_confidence: "muted",
} as const;

const TYPE_LABEL = {
  direct: "Direct",
  partial: "Partial",
  low_confidence: "Possible",
};

export function CompetitorsTab({ status, result }: CompetitorsTabProps) {
  const competitors = result?.data?.competitors ?? [];
  if (competitors.length === 0) {
    return (
      <AgentResultEmpty
        status={status}
        pendingTitle="Competitors not yet discovered"
        pendingDescription="The Competitor Discovery agent will surface direct, partial, and low-confidence competitors with evidence URLs."
      />
    );
  }

  const direct = competitors.filter((c) => c.competitorType === "direct");
  const partial = competitors.filter((c) => c.competitorType === "partial");
  const possible = competitors.filter(
    (c) => c.competitorType === "low_confidence",
  );

  return (
    <div className="space-y-6">
      <CompetitorGroup title="Direct competitors" competitors={direct} />
      <CompetitorGroup title="Partial competitors" competitors={partial} />
      <CompetitorGroup
        title="Low-confidence possibilities"
        competitors={possible}
      />
    </div>
  );
}

function CompetitorGroup({
  title,
  competitors,
}: {
  title: string;
  competitors: Competitor[];
}) {
  if (!competitors.length) return null;
  return (
    <section>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {title} <span className="text-[var(--muted)]">({competitors.length})</span>
      </h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {competitors.map((competitor) => (
          <Card key={`${competitor.name}-${competitor.websiteUrl}`}>
            <CardBody className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="truncate font-semibold">{competitor.name}</h4>
                  <a
                    href={competitor.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-[var(--info)] hover:underline"
                  >
                    {getDomain(competitor.websiteUrl)}
                  </a>
                </div>
                <Badge tone={TYPE_TONE[competitor.competitorType]}>
                  {TYPE_LABEL[competitor.competitorType]}
                </Badge>
              </div>
              <p className="text-sm">{competitor.shortDescription}</p>
              <p className="text-xs text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">
                  Why:
                </span>{" "}
                {competitor.whyTheyCompete}
              </p>
              {competitor.overlappingCustomerSegments?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {competitor.overlappingCustomerSegments.map((segment) => (
                    <Badge key={segment} tone="neutral">
                      {segment}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <EvidenceList urls={competitor.evidenceUrls} className="pt-1" />
            </CardBody>
          </Card>
        ))}
      </div>
    </section>
  );
}
