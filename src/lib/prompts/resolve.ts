import { mergePrompt } from "./merge";
import { getPromptCustomization, getPromptCustomizations } from "./store";
import { getPromptSlot, PROMPT_SLOTS } from "./registry";
import type {
  PromptCustomization,
  PromptCustomizations,
  ResolvedPromptSlot,
} from "./types";

/**
 * Server-side: resolve a single slot's effective system prompt by loading
 * the user's customization (if any) and applying it to the supplied default.
 *
 * Defaults are accepted as a parameter rather than looked up from the
 * registry so each agent file can keep its own canonical default constant
 * — the registry is just for surface area.
 */
export async function resolveSystemPrompt(
  slotId: string,
  defaultPrompt: string,
): Promise<string> {
  try {
    const customization = await getPromptCustomization(slotId);
    return mergePrompt(defaultPrompt, customization);
  } catch (error) {
    // A storage hiccup must not break the agent pipeline. Fall back to
    // the built-in default and log so it's debuggable.
    console.error(
      `[prompts] failed to load customization for ${slotId}; using default.`,
      error instanceof Error ? error.message : error,
    );
    return defaultPrompt;
  }
}

/**
 * Load every slot definition with its current customization and effective
 * prompt attached. Used by the Settings page's initial render.
 */
export async function listResolvedPromptSlots(): Promise<ResolvedPromptSlot[]> {
  const customizations = await getPromptCustomizations().catch(
    () => ({}) as PromptCustomizations,
  );
  return PROMPT_SLOTS.map((slot) => {
    const customization = customizations[slot.id] ?? null;
    return {
      ...slot,
      customization,
      effectivePrompt: mergePrompt(slot.defaultPrompt, customization),
    } satisfies ResolvedPromptSlot;
  });
}

export function resolvedSlotFromCustomization(
  slotId: string,
  customization: PromptCustomization | null,
): ResolvedPromptSlot | null {
  const slot = getPromptSlot(slotId);
  if (!slot) return null;
  return {
    ...slot,
    customization,
    effectivePrompt: mergePrompt(slot.defaultPrompt, customization),
  };
}
