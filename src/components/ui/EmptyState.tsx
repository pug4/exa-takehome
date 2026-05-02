import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-[var(--border-strong)] bg-[var(--surface-alt)] px-6 py-12 text-center",
        className,
      )}
    >
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="max-w-md text-xs leading-relaxed text-[var(--muted)]">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
