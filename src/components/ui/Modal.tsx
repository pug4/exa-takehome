"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /**
   * Optional content rendered inside a sticky footer at the bottom of the
   * dialog. Useful for action buttons that should stay visible while the
   * body scrolls. Note: any `<form>` you want submitted by the footer must
   * wrap both the body and the footer (use the `formId` attribute on the
   * footer's submit button if your form lives only inside `children`).
   */
  footer?: ReactNode;
  size?: "md" | "lg";
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      // `100dvh` instead of `100vh` so mobile browser chrome (URL bars,
      // virtual keyboards) doesn't clip the dialog. `overflow-y-auto` on
      // the backdrop is a fallback if a caller renders something taller
      // than the dialog cap (it'll still be reachable via the page scroll).
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-6 backdrop-blur-sm sm:py-10"
      onClick={onClose}
    >
      <div
        className={cn(
          "flex max-h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-exa-lg sm:max-h-[calc(100dvh-5rem)]",
          size === "md" ? "max-w-lg" : "max-w-2xl",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {(title || description) && (
          <div className="shrink-0 border-b border-[var(--border)] px-6 py-5">
            {title && (
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-xs text-[var(--muted)]">{description}</p>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
