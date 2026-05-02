import type { Engagement } from "@/types/engagement";
import type { CustomTab, CustomTabResult } from "@/types/customTab";
import { getEngagement, getKvAdapter, saveEngagement } from "./db";
import { newCustomTabId } from "./ids";

/** UI cap so a 200-char label doesn't blow up the tab strip. */
export const CUSTOM_TAB_LABEL_MAX = 60;
export const CUSTOM_TAB_PROMPT_MAX = 4000;

const customResultKey = (engagementId: string, tabId: string): string =>
  `eng:${engagementId}:custom-result:${tabId}`;

export interface CreateCustomTabInput {
  label: string;
  prompt: string;
}

export class CustomTabValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomTabValidationError";
  }
}

function normaliseInput(input: CreateCustomTabInput): {
  label: string;
  prompt: string;
} {
  const label = (input.label ?? "").trim();
  const prompt = (input.prompt ?? "").trim();
  if (!label) {
    throw new CustomTabValidationError("Tab name is required");
  }
  if (label.length > CUSTOM_TAB_LABEL_MAX) {
    throw new CustomTabValidationError(
      `Tab name must be ${CUSTOM_TAB_LABEL_MAX} characters or fewer`,
    );
  }
  if (!prompt) {
    throw new CustomTabValidationError("Research prompt is required");
  }
  if (prompt.length > CUSTOM_TAB_PROMPT_MAX) {
    throw new CustomTabValidationError(
      `Prompt must be ${CUSTOM_TAB_PROMPT_MAX} characters or fewer`,
    );
  }
  return { label, prompt };
}

export async function createCustomTab(
  engagementId: string,
  input: CreateCustomTabInput,
): Promise<{ engagement: Engagement; tab: CustomTab }> {
  const engagement = await getEngagement(engagementId);
  if (!engagement) {
    throw new Error(`Engagement ${engagementId} not found`);
  }

  const { label, prompt } = normaliseInput(input);

  const now = new Date().toISOString();
  const tab: CustomTab = {
    id: newCustomTabId(),
    label,
    prompt,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  const updated: Engagement = {
    ...engagement,
    customTabs: [...(engagement.customTabs ?? []), tab],
    updatedAt: now,
  };
  await saveEngagement(updated);

  return { engagement: updated, tab };
}

export async function deleteCustomTab(
  engagementId: string,
  tabId: string,
): Promise<Engagement | null> {
  const engagement = await getEngagement(engagementId);
  if (!engagement) return null;

  const before = engagement.customTabs ?? [];
  const after = before.filter((tab) => tab.id !== tabId);
  if (after.length === before.length) {
    // Tab didn't exist on this engagement — still attempt to clean up
    // any orphaned result keys, but don't bump updatedAt.
    await getKvAdapter().del(customResultKey(engagementId, tabId));
    return engagement;
  }

  const updated: Engagement = {
    ...engagement,
    customTabs: after,
    updatedAt: new Date().toISOString(),
  };
  await saveEngagement(updated);
  await getKvAdapter().del(customResultKey(engagementId, tabId));
  return updated;
}

export async function updateCustomTabStatus(
  engagementId: string,
  tabId: string,
  status: CustomTab["status"],
): Promise<Engagement | null> {
  const engagement = await getEngagement(engagementId);
  if (!engagement) return null;
  const tabs = engagement.customTabs ?? [];
  let changed = false;
  const next = tabs.map((tab) => {
    if (tab.id !== tabId) return tab;
    changed = true;
    return { ...tab, status, updatedAt: new Date().toISOString() };
  });
  if (!changed) return engagement;
  const updated: Engagement = {
    ...engagement,
    customTabs: next,
    updatedAt: new Date().toISOString(),
  };
  await saveEngagement(updated);
  return updated;
}

export async function saveCustomTabResult(
  result: CustomTabResult,
): Promise<void> {
  await getKvAdapter().set(
    customResultKey(result.engagementId, result.tabId),
    result,
  );
}

export async function getCustomTabResult(
  engagementId: string,
  tabId: string,
): Promise<CustomTabResult | null> {
  return getKvAdapter().get<CustomTabResult>(
    customResultKey(engagementId, tabId),
  );
}

export type CustomResultsByTabId = Record<string, CustomTabResult>;

export async function getAllCustomTabResults(
  engagement: Engagement,
): Promise<CustomResultsByTabId> {
  const tabs = engagement.customTabs ?? [];
  if (tabs.length === 0) return {};
  const kv = getKvAdapter();
  const items = await Promise.all(
    tabs.map((tab) =>
      kv.get<CustomTabResult>(customResultKey(engagement.id, tab.id)),
    ),
  );
  const out: CustomResultsByTabId = {};
  items.forEach((item, index) => {
    if (item) out[tabs[index].id] = item;
  });
  return out;
}

/** Internal helper used by the engagement-deletion cascade. */
export const customTabResultKeyPattern = (engagementId: string): string =>
  `eng:${engagementId}:custom-result:*`;
