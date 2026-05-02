import type { AgentStatus } from "@/types/engagement";
import { EmptyState } from "@/components/ui/EmptyState";

interface AgentResultEmptyProps {
  status: AgentStatus | undefined;
  pendingTitle?: string;
  pendingDescription?: string;
  failedDescription?: string;
}

export function AgentResultEmpty({
  status,
  pendingTitle = "Not generated yet",
  pendingDescription = "Run the pipeline to populate this section.",
  failedDescription = "This agent failed. Re-run the pipeline to try again.",
}: AgentResultEmptyProps) {
  if (status === "running") {
    return (
      <EmptyState
        title="Running…"
        description="The agent is working — results will stream in shortly."
      />
    );
  }
  if (status === "failed") {
    return <EmptyState title="Failed" description={failedDescription} />;
  }
  return <EmptyState title={pendingTitle} description={pendingDescription} />;
}
