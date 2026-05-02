import type { AgentStatus } from "@/types/engagement";
import { Badge } from "@/components/ui/Badge";

const STATUS_TONE: Record<
  AgentStatus,
  React.ComponentProps<typeof Badge>["tone"]
> = {
  pending: "muted",
  running: "info",
  complete: "success",
  failed: "danger",
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      {status === "running" && (
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--info)] pulse-dot" />
      )}
      {status}
    </Badge>
  );
}
