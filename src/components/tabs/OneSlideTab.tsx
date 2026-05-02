"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentStatus } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AgentResultEmpty } from "@/components/AgentResultEmpty";

interface OneSlideTabProps {
  status: AgentStatus;
  result?: ResearchResult<"oneSlideSummary">;
}

export function OneSlideTab({ status, result }: OneSlideTabProps) {
  const data = result?.data;
  const [copied, setCopied] = useState(false);

  if (!data?.markdown) {
    return (
      <AgentResultEmpty
        status={status}
        pendingTitle="One-slide summary not generated"
        pendingDescription="A clean Markdown slide ready to paste into a deck."
      />
    );
  }

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(data.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy Markdown"}
        </Button>
      </div>
      <Card>
        <CardBody className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {data.markdown}
          </ReactMarkdown>
        </CardBody>
      </Card>
    </div>
  );
}
