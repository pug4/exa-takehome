"use client";

import { useMemo } from "react";
import type { AgentStatus } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AgentResultEmpty } from "@/components/AgentResultEmpty";

interface DiscoveryQuestionsTabProps {
  status: AgentStatus;
  result?: ResearchResult<"discoveryQuestions">;
}

export function DiscoveryQuestionsTab({
  status,
  result,
}: DiscoveryQuestionsTabProps) {
  const questions = useMemo(
    () => result?.data?.recommendedQuestions ?? [],
    [result],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, typeof questions>();
    for (const question of questions) {
      const list = map.get(question.theme) ?? [];
      list.push(question);
      map.set(question.theme, list);
    }
    return [...map.entries()];
  }, [questions]);

  if (questions.length === 0) {
    return (
      <AgentResultEmpty
        status={status}
        pendingTitle="No discovery questions yet"
        pendingDescription="The Discovery Questions agent generates first-call questions across market, customer, competition, and pricing."
      />
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(([theme, items]) => (
        <section key={theme}>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            {theme}
            <span className="rounded-full bg-[var(--surface-alt)] px-1.5 py-0.5 text-[10px]">
              {items.length}
            </span>
          </h3>
          <div className="space-y-2">
            {items.map((question, index) => (
              <Card key={`${question.question}-${index}`}>
                <CardBody className="space-y-2">
                  <p className="text-sm font-medium">{question.question}</p>
                  <p className="text-xs text-[var(--muted)]">
                    <span className="font-medium text-[var(--foreground)]">
                      Why it matters:
                    </span>{" "}
                    {question.whyItMatters}
                  </p>
                  <Badge tone="neutral">Ask: {question.whoToAsk}</Badge>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
