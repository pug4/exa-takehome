"use client";

import type { AgentType } from "@/types/engagement";
import { AGENT_LABELS, AGENT_ORDER } from "@/lib/agents";
import { cn } from "@/lib/cn";

interface AgentTabSelectorProps {
  /**
   * Agent tabs currently selected. Order does not need to match
   * {@link AGENT_ORDER}; the selector renders agents in canonical order.
   */
  selected: AgentType[];
  onChange: (next: AgentType[]) => void;
  disabled?: boolean;
  /**
   * Optional id prefix so multiple selectors on the same page have unique
   * `htmlFor` / `id` pairs.
   */
  idPrefix?: string;
}

const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  clientProfile: "Company snapshot inferred from the client URL.",
  competitors: "Direct, partial, and possible competitor list.",
  deepCompetitiveAnalysis: "Detailed teardown of selected competitors.",
  emergingPlayers: "Adjacent, substitute, and ecosystem players.",
  marketSignals: "Recent funding, M&A, regulatory, and trend signals.",
  customerSegments: "Buyer personas, pains, and triggers.",
  discoveryQuestions: "First-call discovery question bank.",
  expertCalls: "Suggested expert-call targets and questions.",
  memo: "First-pass consulting research memo.",
  oneSlideSummary: "Client-ready one-slide summary.",
};

export function AgentTabSelector({
  selected,
  onChange,
  disabled,
  idPrefix = "agent-tab",
}: AgentTabSelectorProps) {
  const selectedSet = new Set(selected);

  const toggle = (agent: AgentType): void => {
    if (disabled) return;
    const nextSet = new Set(selectedSet);
    if (nextSet.has(agent)) nextSet.delete(agent);
    else nextSet.add(agent);
    // Preserve canonical order so the tab bar stays consistent.
    onChange(AGENT_ORDER.filter((a) => nextSet.has(a)));
  };

  const setAll = (enable: boolean): void => {
    if (disabled) return;
    onChange(enable ? [...AGENT_ORDER] : []);
  };

  const allSelected = selected.length === AGENT_ORDER.length;
  const noneSelected = selected.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--muted)]">
          {selected.length} of {AGENT_ORDER.length} tabs selected
        </p>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => setAll(true)}
            disabled={disabled || allSelected}
            className="font-medium text-[var(--accent)] hover:underline disabled:cursor-not-allowed disabled:text-[var(--muted)] disabled:no-underline"
          >
            Select all
          </button>
          <span className="text-[var(--border-strong)]">·</span>
          <button
            type="button"
            onClick={() => setAll(false)}
            disabled={disabled || noneSelected}
            className="font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:hover:text-[var(--muted)]"
          >
            Clear
          </button>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {AGENT_ORDER.map((agent) => {
          const checked = selectedSet.has(agent);
          const id = `${idPrefix}-${agent}`;
          return (
            <li key={agent}>
              <label
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                  checked
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(agent)}
                  className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-tight">
                    {AGENT_LABELS[agent]}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
                    {AGENT_DESCRIPTIONS[agent]}
                  </p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
