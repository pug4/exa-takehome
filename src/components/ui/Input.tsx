"use client";

import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

const FIELD_CLASSES =
  "w-full rounded-input border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-sm placeholder:text-[var(--muted)] transition-colors focus:outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/20";

export function Input({ label, hint, className, ...rest }: InputProps) {
  return (
    <label className="flex flex-col gap-1">
      {label && (
        <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
      )}
      <input {...rest} className={cn(FIELD_CLASSES, className)} />
      {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export function Textarea({ label, hint, className, ...rest }: TextareaProps) {
  return (
    <label className="flex flex-col gap-1">
      {label && (
        <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
      )}
      <textarea
        {...rest}
        className={cn(FIELD_CLASSES, "min-h-[80px] resize-y", className)}
      />
      {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}
