import type { EvidenceLink } from "@/types/research";
import { getDomain } from "@/lib/url";
import { cn } from "@/lib/cn";

interface EvidenceListProps {
  citations?: EvidenceLink[];
  urls?: string[];
  className?: string;
  max?: number;
}

export function EvidenceList({
  citations = [],
  urls = [],
  className,
  max = 12,
}: EvidenceListProps) {
  const merged = [
    ...citations.map((c) => ({ url: c.url, title: c.title })),
    ...urls.filter((u) => !citations.some((c) => c.url === u)).map((u) => ({
      url: u,
      title: undefined,
    })),
  ];
  if (merged.length === 0) return null;

  const visible = merged.slice(0, max);
  const remaining = merged.length - visible.length;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {visible.map((item) => (
        <a
          key={item.url}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          title={item.title ?? item.url}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-2 py-0.5 text-[11px] text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
        >
          <span aria-hidden>↗</span>
          {getDomain(item.url)}
        </a>
      ))}
      {remaining > 0 && (
        <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
          +{remaining} more
        </span>
      )}
    </div>
  );
}
