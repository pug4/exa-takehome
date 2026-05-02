import { getKvAdapter } from "../db";
import { isPromptSlotId } from "./registry";
import type { PromptCustomization, PromptCustomizations } from "./types";

const STORE_KEY = "prompts:settings:v1";

/**
 * Load all current customizations as a flat map keyed by slot id. Unknown
 * slot ids (e.g. left over from a previous version) are dropped on read so
 * stale data never leaks into the resolver.
 */
export async function getPromptCustomizations(): Promise<PromptCustomizations> {
  const raw =
    (await getKvAdapter().get<PromptCustomizations>(STORE_KEY)) ?? {};
  const cleaned: PromptCustomizations = {};
  for (const [slotId, value] of Object.entries(raw)) {
    if (!isPromptSlotId(slotId)) continue;
    if (!value || typeof value !== "object") continue;
    if (typeof value.text !== "string") continue;
    if (value.mode !== "append" && value.mode !== "replace") continue;
    cleaned[slotId] = {
      mode: value.mode,
      text: value.text,
      updatedAt:
        typeof value.updatedAt === "string"
          ? value.updatedAt
          : new Date(0).toISOString(),
    };
  }
  return cleaned;
}

export async function getPromptCustomization(
  slotId: string,
): Promise<PromptCustomization | null> {
  const all = await getPromptCustomizations();
  return all[slotId] ?? null;
}

export async function setPromptCustomization(
  slotId: string,
  next: Pick<PromptCustomization, "mode" | "text">,
): Promise<PromptCustomization> {
  if (!isPromptSlotId(slotId)) {
    throw new Error(`Unknown prompt slot id: ${slotId}`);
  }
  const all = await getPromptCustomizations();
  const trimmed = next.text.trim();
  // Empty text is treated as "no customization" — clear the entry so the
  // resolver falls back to the default cleanly.
  if (trimmed.length === 0) {
    delete all[slotId];
    await getKvAdapter().set(STORE_KEY, all);
    return {
      mode: next.mode,
      text: "",
      updatedAt: new Date().toISOString(),
    };
  }
  const updated: PromptCustomization = {
    mode: next.mode,
    text: trimmed,
    updatedAt: new Date().toISOString(),
  };
  all[slotId] = updated;
  await getKvAdapter().set(STORE_KEY, all);
  return updated;
}

export async function clearPromptCustomization(slotId: string): Promise<void> {
  if (!isPromptSlotId(slotId)) {
    throw new Error(`Unknown prompt slot id: ${slotId}`);
  }
  const all = await getPromptCustomizations();
  if (!(slotId in all)) return;
  delete all[slotId];
  await getKvAdapter().set(STORE_KEY, all);
}

export async function clearAllPromptCustomizations(): Promise<void> {
  await getKvAdapter().del(STORE_KEY);
}
