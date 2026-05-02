"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentStatus, AgentType, Engagement } from "@/types/engagement";
import type { CustomTab } from "@/types/customTab";
import { cn } from "@/lib/cn";
import { AGENT_LABELS, AGENT_ORDER } from "@/lib/agents";
import { getEnabledAgents } from "@/lib/engagements";

export type CustomTabKey = `custom:${string}`;
export type TabKey =
  | "overview"
  | AgentType
  | "monitoring"
  | "exports"
  | CustomTabKey;

interface TabDescriptor {
  key: TabKey;
  label: string;
  agent?: AgentType;
  customTab?: CustomTab;
}

interface EngagementTabsProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  engagement: Engagement;
  /**
   * When provided, the tab bar shows controls for adding and removing
   * agent-backed tabs. Without this callback the bar is read-only.
   */
  onEnabledAgentsChange?: (next: AgentType[]) => void;
  /** Called when the user wants to remove an existing custom tab. */
  onRemoveCustomTab?: (tabId: string) => void;
  /** Called when the user picks "Add custom tab" from the popover. */
  onAddCustomTab?: () => void;
  isUpdating?: boolean;
}

const STATUS_DOT: Record<AgentStatus, string> = {
  pending: "bg-[var(--border-strong)]",
  running: "bg-[var(--info)] pulse-dot",
  complete: "bg-[var(--success)]",
  failed: "bg-[var(--danger)]",
};

function buildTabDescriptors(
  enabledAgents: AgentType[],
  customTabs: CustomTab[],
): TabDescriptor[] {
  return [
    { key: "overview", label: "Overview" },
    { key: "monitoring", label: "Monitoring" },
    ...enabledAgents.map<TabDescriptor>((agent) => ({
      key: agent,
      label: AGENT_LABELS[agent],
      agent,
    })),
    ...customTabs.map<TabDescriptor>((tab) => ({
      key: customTabKey(tab.id),
      label: tab.label,
      customTab: tab,
    })),
    { key: "exports", label: "Exports" },
  ];
}

export function customTabKey(id: string): CustomTabKey {
  return `custom:${id}` as CustomTabKey;
}

export function parseCustomTabKey(key: TabKey): string | null {
  if (typeof key !== "string") return null;
  return key.startsWith("custom:") ? key.slice("custom:".length) : null;
}

export function EngagementTabs({
  active,
  onChange,
  engagement,
  onEnabledAgentsChange,
  onRemoveCustomTab,
  onAddCustomTab,
  isUpdating,
}: EngagementTabsProps) {
  const enabledAgents = getEnabledAgents(engagement);
  const customTabs = engagement.customTabs ?? [];
  const tabs = buildTabDescriptors(enabledAgents, customTabs);
  const enabledSet = new Set(enabledAgents);
  const disabledAgents = AGENT_ORDER.filter((agent) => !enabledSet.has(agent));
  const canEditAgents = Boolean(onEnabledAgentsChange);
  const canEditCustomTabs = Boolean(onRemoveCustomTab);
  const canAddCustomTab = Boolean(onAddCustomTab);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!addMenuOpen) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (
        addMenuRef.current &&
        !addMenuRef.current.contains(event.target as Node)
      ) {
        setAddMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setAddMenuOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [addMenuOpen]);

  const addAgent = (agent: AgentType): void => {
    if (!onEnabledAgentsChange) return;
    if (enabledSet.has(agent)) return;
    const next = AGENT_ORDER.filter(
      (candidate) => enabledSet.has(candidate) || candidate === agent,
    );
    setAddMenuOpen(false);
    onEnabledAgentsChange(next);
  };

  const removeAgent = (agent: AgentType): void => {
    if (!onEnabledAgentsChange) return;
    if (!enabledSet.has(agent)) return;
    const next = enabledAgents.filter((candidate) => candidate !== agent);
    onEnabledAgentsChange(next);
  };

  const handleAddCustomTab = (): void => {
    if (!onAddCustomTab) return;
    setAddMenuOpen(false);
    onAddCustomTab();
  };

  const handleRemoveCustomTab = (tabId: string): void => {
    onRemoveCustomTab?.(tabId);
  };

  const showAddTrigger =
    (canEditAgents && disabledAgents.length > 0) || canAddCustomTab;

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)]">
      {/*
        The trigger lives OUTSIDE the scrollable nav so that:
          1. its absolutely-positioned popover isn't clipped by the nav's
             `overflow-x-auto` (a spec-level interaction where overflow on
             one axis forces clipping on both — this was the "Add tab
             popover invisible" bug),
          2. the "+ Add tab" affordance stays visible no matter how many
             tabs exist or how the user has scrolled the strip.
      */}
      <div className="flex items-stretch">
        <nav
          role="tablist"
          className="scrollbar-hide flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto pl-6"
        >
          {tabs.map((tab) => {
            const isActive = active === tab.key;
            const status = tab.agent
              ? engagement.agents[tab.agent]
              : tab.customTab?.status;
            const isAgentRemovable = canEditAgents && Boolean(tab.agent);
            const isCustomRemovable =
              canEditCustomTabs && Boolean(tab.customTab);
            const removable = isAgentRemovable || isCustomRemovable;
            return (
              <div
                key={tab.key}
                className={cn(
                  "group relative flex items-center border-b-2",
                  isActive
                    ? "border-[var(--accent)] text-[var(--foreground)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onChange(tab.key)}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap px-3 py-3 text-xs font-medium transition-colors",
                    removable && "pr-1.5",
                  )}
                >
                  {status && (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        STATUS_DOT[status],
                      )}
                      aria-label={status}
                    />
                  )}
                  {tab.customTab && (
                    <span
                      className="rounded-sm bg-[var(--accent)]/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)]"
                      aria-hidden
                    >
                      Custom
                    </span>
                  )}
                  {tab.label}
                </button>
                {removable && (
                  <button
                    type="button"
                    onClick={() => {
                      if (tab.agent) removeAgent(tab.agent);
                      else if (tab.customTab) {
                        handleRemoveCustomTab(tab.customTab.id);
                      }
                    }}
                    disabled={isUpdating}
                    aria-label={`Remove ${tab.label} tab`}
                    title={`Remove ${tab.label} tab`}
                    className={cn(
                      "mr-1.5 grid h-4 w-4 place-items-center rounded-full text-[var(--muted)] transition-all",
                      "opacity-0 hover:bg-[var(--surface-alt)] hover:text-[var(--foreground)] focus:opacity-100 focus:outline-none focus-visible:opacity-100 group-hover:opacity-100",
                      isActive && "opacity-100",
                      isUpdating && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        {showAddTrigger && (
          <div
            ref={addMenuRef}
            className="relative flex shrink-0 items-center pl-2 pr-6"
          >
            <button
              type="button"
              onClick={() => setAddMenuOpen((prev) => !prev)}
              disabled={isUpdating}
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              title="Add a tab"
              className={cn(
                "my-2 flex items-center gap-1.5 self-center whitespace-nowrap rounded-md border border-dashed border-[var(--border-strong)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--foreground)]",
                isUpdating &&
                  "cursor-not-allowed opacity-60 hover:border-[var(--border-strong)] hover:text-[var(--muted)]",
              )}
            >
              <PlusIcon />
              <span>Add tab</span>
            </button>

            {addMenuOpen && (
              <div
                role="menu"
                className="absolute right-6 top-full z-30 mt-1 w-72 overflow-hidden rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-exa-lg"
              >
                {canEditAgents && disabledAgents.length > 0 && (
                  <>
                    <div className="border-b border-[var(--border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Built-in research tabs
                    </div>
                    <ul className="max-h-72 overflow-y-auto py-1">
                      {disabledAgents.map((agent) => (
                        <li key={agent}>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => addAgent(agent)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--surface-alt)]"
                          >
                            <span>{AGENT_LABELS[agent]}</span>
                            <PlusIcon />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {canAddCustomTab && (
                  <div
                    className={cn(
                      canEditAgents &&
                        disabledAgents.length > 0 &&
                        "border-t border-[var(--border)]",
                    )}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleAddCustomTab}
                      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--surface-alt)]"
                    >
                      <span
                        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)]"
                        aria-hidden
                      >
                        <SparkIcon />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium tracking-tight">
                          Add a custom tab
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
                          Write a research prompt and let an Exa agent answer
                          it for this engagement.
                        </span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The full set of *built-in* tab keys, used for URL parsing. Custom tab
 * keys aren't enumerated here because their ids are dynamic; resolve them
 * separately against the engagement's `customTabs` array.
 */
export const TAB_KEYS: TabKey[] = [
  "overview",
  "monitoring",
  ...AGENT_ORDER,
  "exports",
];

function PlusIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  );
}
