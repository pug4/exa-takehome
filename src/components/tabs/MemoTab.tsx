"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentStatus } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import { Card, CardBody } from "@/components/ui/Card";
import { AgentResultEmpty } from "@/components/AgentResultEmpty";

interface MemoTabProps {
  status: AgentStatus;
  result?: ResearchResult<"memo">;
}

export function MemoTab({ status, result }: MemoTabProps) {
  const markdown = result?.data?.markdown;
  if (!markdown) {
    return (
      <AgentResultEmpty
        status={status}
        pendingTitle="Memo not yet generated"
        pendingDescription="The Research Memo agent synthesizes everything above into a first-pass consulting memo."
      />
    );
  }

  return (
    <Card>
      <CardBody className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </CardBody>
    </Card>
  );
}
