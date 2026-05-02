import type { AgentStatus } from "./engagement";
import type { EvidenceLink } from "./research";

/**
 * A user-authored research tab. Each custom tab carries its own prompt
 * which is fed to a generic Exa-powered agent that returns Markdown plus
 * citations. Stored on the parent {@link Engagement} as `customTabs`.
 */
export interface CustomTab {
  id: string;
  /** Display name shown in the tab strip. Limited length, see store. */
  label: string;
  /** Free-form research question / instructions for the agent. */
  prompt: string;
  /**
   * Lifecycle status — mirrors built-in agent statuses so the UI can use
   * the same rendering primitives (status dots, "running…" empty state,
   * etc.) for both kinds of tabs.
   */
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CustomTabResultData {
  /** Markdown body produced by the agent. */
  markdown: string;
}

export interface CustomTabResult {
  id: string;
  engagementId: string;
  tabId: string;
  status: "complete" | "failed";
  data?: CustomTabResultData;
  error?: string;
  citations?: EvidenceLink[];
  createdAt: string;
  updatedAt: string;
}
