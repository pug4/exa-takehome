"use client";

import type { AgentStatus } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EvidenceList } from "@/components/EvidenceList";
import { AgentResultEmpty } from "@/components/AgentResultEmpty";

const SIGNAL_TYPE_LABEL: Record<string, string> = {
  demand_trend: "Demand trend",
  funding: "Funding",
  ma: "M&A",
  regulation: "Regulation",
  product_launch: "Product launch",
  hiring: "Hiring",
  pricing_change: "Pricing change",
  partnership: "Partnership",
  tech_shift: "Tech shift",
  macro: "Macro",
};

interface MarketSignalsTabProps {
  status: AgentStatus;
  result?: ResearchResult<"marketSignals">;
}

export function MarketSignalsTab({ status, result }: MarketSignalsTabProps) {
  const signals = result?.data?.marketSignals ?? [];
  if (signals.length === 0) {
    return (
      <AgentResultEmpty
        status={status}
        pendingTitle="No market signals yet"
        pendingDescription="The Market Signals agent retrieves recent funding, M&A, regulation, product launches, hiring, and trend data."
      />
    );
  }

  return (
    <div className="space-y-3">
      {signals.map((signal, index) => (
        <Card key={`${signal.signal}-${index}`}>
          <CardBody className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold">{signal.signal}</h4>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone="info">
                  {SIGNAL_TYPE_LABEL[signal.signalType] ?? signal.signalType}
                </Badge>
                {signal.date && (
                  <span className="text-[10px] text-[var(--muted)]">
                    {signal.date}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-[var(--muted)]">
              <span className="font-medium text-[var(--foreground)]">
                Why it matters:
              </span>{" "}
              {signal.whyItMatters}
            </p>
            <p className="text-xs text-[var(--muted)]">
              <span className="font-medium text-[var(--foreground)]">
                Implication for client:
              </span>{" "}
              {signal.implicationForClient}
            </p>
            {signal.affectedPlayers?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {signal.affectedPlayers.map((player) => (
                  <Badge key={player} tone="neutral">
                    {player}
                  </Badge>
                ))}
              </div>
            ) : null}
            <EvidenceList urls={signal.evidenceUrls} className="pt-1" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
