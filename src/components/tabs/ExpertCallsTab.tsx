"use client";

import type { AgentStatus } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AgentResultEmpty } from "@/components/AgentResultEmpty";

const PRIORITY_TONE = {
  low: "muted",
  medium: "warning",
  high: "danger",
} as const;

interface ExpertCallsTabProps {
  status: AgentStatus;
  result?: ResearchResult<"expertCalls">;
}

export function ExpertCallsTab({ status, result }: ExpertCallsTabProps) {
  const targets = result?.data?.expertCallTargets ?? [];
  if (targets.length === 0) {
    return (
      <AgentResultEmpty
        status={status}
        pendingTitle="No expert-call targets yet"
        pendingDescription="The Expert-Call Target agent suggests target profiles like former execs, buyers, and analysts."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {targets.map((target, index) => (
        <Card key={`${target.targetProfile}-${index}`}>
          <CardBody className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold">{target.targetProfile}</h4>
              <Badge tone={PRIORITY_TONE[target.priority]}>
                {target.priority}
              </Badge>
            </div>
            <p className="text-xs text-[var(--muted)]">
              <span className="font-medium text-[var(--foreground)]">
                Why useful:
              </span>{" "}
              {target.whyUseful}
            </p>
            <p className="text-xs text-[var(--muted)]">
              <span className="font-medium text-[var(--foreground)]">
                Ideal background:
              </span>{" "}
              {target.idealBackground}
            </p>
            {target.sampleQuestions?.length ? (
              <div>
                <h5 className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Sample questions
                </h5>
                <ul className="mt-1 space-y-1 text-sm">
                  {target.sampleQuestions.map((question, qIndex) => (
                    <li key={`${question}-${qIndex}`}>· {question}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
