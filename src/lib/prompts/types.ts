import type { AgentType } from "@/types/engagement";

/**
 * How a user's customization is combined with the built-in default
 * system prompt for an agent.
 *
 * - `append`: user text is appended to the default ("add your own twist on top
 *    of how we already prompt the agent"). This is the recommended default.
 * - `replace`: user text replaces the default entirely. Power-user mode for
 *    rewriting our prompt from scratch.
 */
export type PromptMergeMode = "append" | "replace";

/**
 * A single configurable prompt slot. Every Exa /search call we make that
 * includes a `systemPrompt` is exposed as one of these slots so the user
 * can adjust how the agent reasons.
 */
export interface PromptSlot {
  id: string;
  agent: AgentType;
  label: string;
  description: string;
  defaultPrompt: string;
}

export interface PromptCustomization {
  mode: PromptMergeMode;
  text: string;
  updatedAt: string;
}

export type PromptCustomizations = Record<string, PromptCustomization>;

/** Same slot shape, but with the user's current customization (if any) attached. */
export interface ResolvedPromptSlot extends PromptSlot {
  customization: PromptCustomization | null;
  effectivePrompt: string;
}
