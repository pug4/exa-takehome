"use client";

import type { AgentStatus } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AgentResultEmpty } from "@/components/AgentResultEmpty";

interface CustomerSegmentsTabProps {
  status: AgentStatus;
  result?: ResearchResult<"customerSegments">;
}

export function CustomerSegmentsTab({
  status,
  result,
}: CustomerSegmentsTabProps) {
  const data = result?.data;
  if (!data?.customerSegments?.length) {
    return (
      <AgentResultEmpty
        status={status}
        pendingTitle="Customer segments not yet generated"
        pendingDescription="The Customer Segmentation agent infers buyer types, pain points, and buying triggers."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.customerSegments.map((segment, index) => (
          <Card key={`${segment.segment}-${index}`}>
            <CardBody className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold">{segment.segment}</h4>
                <Badge tone="info">{segment.buyerType}</Badge>
              </div>
              <Section
                label="Pain points"
                items={segment.likelyPainPoints}
              />
              <Section
                label="Buying triggers"
                items={segment.buyingTriggers}
              />
              <Section label="Objections" items={segment.objections} />
              {segment.verticals?.length ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {segment.verticals.map((vertical) => (
                    <Badge key={vertical} tone="neutral">
                      {vertical}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SmallList title="Buyer personas" items={data.buyerPersonas} />
        <SmallList title="Open questions" items={data.openQuestions} />
        <SmallList title="Assumptions" items={data.assumptions} muted />
      </div>
    </div>
  );
}

function Section({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h5 className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </h5>
      <ul className="mt-1 space-y-1 text-sm">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>· {item}</li>
        ))}
      </ul>
    </div>
  );
}

function SmallList({
  title,
  items,
  muted,
}: {
  title: string;
  items?: string[];
  muted?: boolean;
}) {
  return (
    <Card>
      <CardBody>
        <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          {title}
        </h4>
        {items?.length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {items.map((item, index) => (
              <li
                key={`${item}-${index}`}
                className={muted ? "text-[var(--muted)]" : ""}
              >
                · {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-[var(--muted)]">—</p>
        )}
      </CardBody>
    </Card>
  );
}
