import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "muted";

interface BadgeProps {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}

const TONE_CLASSES: Record<Tone, string> = {
  neutral:
    "border border-[var(--border-strong)] bg-[var(--surface-alt)] text-[var(--foreground)]",
  info: "border border-[var(--info)]/40 bg-[var(--info)]/10 text-[var(--info)]",
  success:
    "border border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]",
  warning:
    "border border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]",
  danger:
    "border border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]",
  muted: "bg-[var(--surface-alt)] text-[var(--muted)]",
};

export function Badge({ tone = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
