import type {
  MonitorFindingKind,
  MonitorFindingSeverity,
  MonitorSourceKind,
} from "@/types/monitoring";
import { Badge } from "@/components/ui/Badge";

const KIND_LABEL: Record<MonitorFindingKind, string> = {
  news: "News",
  announcement: "Announcement",
  product_launch: "Launch",
  funding: "Funding",
  hiring: "Hiring",
  partnership: "Partnership",
  regulation: "Regulation",
  page_change: "Site update",
  other: "Update",
};

const SEVERITY_TONE: Record<
  MonitorFindingSeverity,
  React.ComponentProps<typeof Badge>["tone"]
> = {
  info: "muted",
  update: "info",
  alert: "warning",
};

const KIND_TONE: Record<
  MonitorFindingKind,
  React.ComponentProps<typeof Badge>["tone"]
> = {
  news: "neutral",
  announcement: "neutral",
  product_launch: "info",
  funding: "success",
  hiring: "neutral",
  partnership: "info",
  regulation: "warning",
  page_change: "muted",
  other: "muted",
};

export function FindingKindChip({ kind }: { kind: MonitorFindingKind }) {
  return <Badge tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Badge>;
}

export function FindingSeverityChip({
  severity,
}: {
  severity: MonitorFindingSeverity;
}) {
  return (
    <Badge tone={SEVERITY_TONE[severity]}>
      {severity === "alert" && (
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
      )}
      {severity}
    </Badge>
  );
}

const SOURCE_KIND_LABEL: Record<MonitorSourceKind, string> = {
  client: "Client",
  competitor: "Competitor",
  emerging: "Emerging",
  other: "Source",
};

const SOURCE_KIND_TONE: Record<
  MonitorSourceKind,
  React.ComponentProps<typeof Badge>["tone"]
> = {
  client: "info",
  competitor: "neutral",
  emerging: "warning",
  other: "muted",
};

export function SourceKindChip({ kind }: { kind: MonitorSourceKind }) {
  return <Badge tone={SOURCE_KIND_TONE[kind]}>{SOURCE_KIND_LABEL[kind]}</Badge>;
}
