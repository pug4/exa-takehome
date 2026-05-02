"use client";

import type { AgentStatus } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EvidenceList } from "@/components/EvidenceList";
import { AgentResultEmpty } from "@/components/AgentResultEmpty";

interface ClientProfileTabProps {
  status: AgentStatus;
  result?: ResearchResult<"clientProfile">;
}

export function ClientProfileTab({ status, result }: ClientProfileTabProps) {
  const data = result?.data;
  if (!data) {
    return (
      <AgentResultEmpty
        status={status}
        pendingTitle="Client profile not generated yet"
        pendingDescription="The Client Website Understanding agent extracts category, positioning, products, and target customers from the client's site."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold tracking-tight">
                {data.companyName}
              </h3>
              <p className="text-xs text-[var(--muted)]">{data.category}</p>
            </div>
            <Badge tone="info">confidence: {data.confidenceLevel}</Badge>
          </div>
          <p className="text-sm leading-relaxed">{data.positioningSummary}</p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ListCard title="Products & services" items={data.productsOrServices} />
        <ListCard title="Target customers" items={data.targetCustomers} />
        <ListCard title="Key claims" items={data.claims} />
        <ListCard title="Assumptions & proof" items={data.assumptions} muted />
      </div>

      <Card>
        <CardBody>
          <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Evidence
          </h4>
          <EvidenceList
            urls={data.evidenceUrls}
            citations={result?.citations}
            className="mt-3"
          />
        </CardBody>
      </Card>
    </div>
  );
}

function ListCard({
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
          <ul className="mt-2 space-y-1.5 text-sm">
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
