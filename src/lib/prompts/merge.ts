import type { PromptCustomization, PromptMergeMode } from "./types";

/**
 * Header inserted before the user's text in `append` mode. Kept as a
 * constant so the server resolver and the client-side preview render the
 * exact same string.
 */
export const USER_GUIDANCE_HEADER =
  "ADDITIONAL USER GUIDANCE FROM THE OPERATOR:";

/**
 * Combine a default system prompt with a user customization.
 *
 * Pure helper, no I/O — safe to import from both server agents and the
 * client-side settings preview.
 */
export function mergePrompt(
  defaultPrompt: string,
  customization: PromptCustomization | null | undefined,
): string {
  if (!customization) return defaultPrompt;
  const text = customization.text.trim();
  if (text.length === 0) return defaultPrompt;
  if (customization.mode === "replace") return text;
  return `${defaultPrompt.trim()}\n\n${USER_GUIDANCE_HEADER}\n${text}`;
}

/**
 * Convenience wrapper used by the client-side "preview" before a user has
 * persisted their customization. Mirrors `mergePrompt` exactly.
 */
export function previewEffectivePrompt(
  defaultPrompt: string,
  mode: PromptMergeMode,
  text: string,
): string {
  return mergePrompt(defaultPrompt, {
    mode,
    text,
    updatedAt: new Date(0).toISOString(),
  });
}
