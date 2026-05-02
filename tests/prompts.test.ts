import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  USER_GUIDANCE_HEADER,
  mergePrompt,
  previewEffectivePrompt,
} from "@/lib/prompts/merge";
import { PROMPT_SLOTS, PROMPT_SLOT_IDS } from "@/lib/prompts/registry";

const DEFAULT = "DEFAULT-PROMPT-TEXT";

function clearMemoryStore(): void {
  delete (globalThis as { __EXA_MEMORY_STORE__?: unknown })
    .__EXA_MEMORY_STORE__;
}

describe("prompts / mergePrompt", () => {
  it("returns the default when no customization is set", () => {
    expect(mergePrompt(DEFAULT, null)).toBe(DEFAULT);
    expect(mergePrompt(DEFAULT, undefined)).toBe(DEFAULT);
  });

  it("returns the default when customization text is whitespace-only", () => {
    expect(
      mergePrompt(DEFAULT, {
        mode: "append",
        text: "   \n  \t ",
        updatedAt: new Date().toISOString(),
      }),
    ).toBe(DEFAULT);
  });

  it("appends user text after the default with the guidance header", () => {
    const merged = mergePrompt(DEFAULT, {
      mode: "append",
      text: "Use British English",
      updatedAt: new Date().toISOString(),
    });
    expect(merged.startsWith(DEFAULT)).toBe(true);
    expect(merged).toContain(USER_GUIDANCE_HEADER);
    expect(merged.endsWith("Use British English")).toBe(true);
  });

  it("trims user text but preserves internal whitespace", () => {
    const merged = mergePrompt(DEFAULT, {
      mode: "append",
      text: "  line one\nline two  ",
      updatedAt: new Date().toISOString(),
    });
    expect(merged).toContain("line one\nline two");
    expect(merged.endsWith("  ")).toBe(false);
  });

  it("replaces the default entirely in replace mode", () => {
    const merged = mergePrompt(DEFAULT, {
      mode: "replace",
      text: "FULL OVERRIDE",
      updatedAt: new Date().toISOString(),
    });
    expect(merged).toBe("FULL OVERRIDE");
  });

  it("falls through to default when replace text is empty", () => {
    expect(
      mergePrompt(DEFAULT, {
        mode: "replace",
        text: "",
        updatedAt: new Date().toISOString(),
      }),
    ).toBe(DEFAULT);
  });

  it("previewEffectivePrompt mirrors mergePrompt behaviour", () => {
    expect(previewEffectivePrompt(DEFAULT, "append", "")).toBe(DEFAULT);
    expect(previewEffectivePrompt(DEFAULT, "replace", "X")).toBe("X");
    expect(previewEffectivePrompt(DEFAULT, "append", "X")).toContain(
      USER_GUIDANCE_HEADER,
    );
  });
});

describe("prompts / registry", () => {
  it("has unique slot ids", () => {
    const ids = PROMPT_SLOTS.map((slot) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("PROMPT_SLOT_IDS matches PROMPT_SLOTS", () => {
    const slotIds = new Set(PROMPT_SLOTS.map((slot) => slot.id));
    for (const id of Object.values(PROMPT_SLOT_IDS)) {
      expect(slotIds.has(id)).toBe(true);
    }
  });

  it("every slot has a non-empty default prompt", () => {
    for (const slot of PROMPT_SLOTS) {
      expect(typeof slot.defaultPrompt).toBe("string");
      expect(slot.defaultPrompt.trim().length).toBeGreaterThan(20);
    }
  });
});

describe("prompts / store + resolver (in-memory)", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    clearMemoryStore();
    vi.resetModules();
  });

  afterEach(() => {
    clearMemoryStore();
  });

  async function loadStore() {
    return await import("@/lib/prompts/store");
  }

  async function loadResolver() {
    return await import("@/lib/prompts/resolve");
  }

  it("setPromptCustomization round-trips through the store", async () => {
    const store = await loadStore();
    await store.setPromptCustomization(PROMPT_SLOT_IDS.memo, {
      mode: "append",
      text: "Be concise.",
    });

    const fetched = await store.getPromptCustomization(
      PROMPT_SLOT_IDS.memo,
    );
    expect(fetched).not.toBeNull();
    expect(fetched!.mode).toBe("append");
    expect(fetched!.text).toBe("Be concise.");
  });

  it("setPromptCustomization with empty text clears the slot", async () => {
    const store = await loadStore();
    await store.setPromptCustomization(PROMPT_SLOT_IDS.memo, {
      mode: "append",
      text: "Be concise.",
    });
    await store.setPromptCustomization(PROMPT_SLOT_IDS.memo, {
      mode: "append",
      text: "   ",
    });

    expect(
      await store.getPromptCustomization(PROMPT_SLOT_IDS.memo),
    ).toBeNull();
  });

  it("clearPromptCustomization removes a single slot without touching others", async () => {
    const store = await loadStore();
    await store.setPromptCustomization(PROMPT_SLOT_IDS.memo, {
      mode: "append",
      text: "memo guidance",
    });
    await store.setPromptCustomization(PROMPT_SLOT_IDS.oneSlide, {
      mode: "replace",
      text: "one-slide override",
    });

    await store.clearPromptCustomization(PROMPT_SLOT_IDS.memo);

    expect(await store.getPromptCustomization(PROMPT_SLOT_IDS.memo)).toBeNull();
    const oneSlide = await store.getPromptCustomization(
      PROMPT_SLOT_IDS.oneSlide,
    );
    expect(oneSlide?.text).toBe("one-slide override");
  });

  it("setPromptCustomization rejects unknown slot ids", async () => {
    const store = await loadStore();
    await expect(
      store.setPromptCustomization("not-a-real-slot", {
        mode: "append",
        text: "hi",
      }),
    ).rejects.toThrow(/Unknown prompt slot id/);
  });

  it("resolveSystemPrompt returns the merged prompt when a customization exists", async () => {
    const store = await loadStore();
    const resolver = await loadResolver();

    await store.setPromptCustomization(PROMPT_SLOT_IDS.memo, {
      mode: "append",
      text: "Always quote sources.",
    });

    const merged = await resolver.resolveSystemPrompt(
      PROMPT_SLOT_IDS.memo,
      DEFAULT,
    );
    expect(merged).toContain(DEFAULT);
    expect(merged).toContain("Always quote sources.");
  });

  it("resolveSystemPrompt returns the default when nothing is customized", async () => {
    const resolver = await loadResolver();
    const merged = await resolver.resolveSystemPrompt(
      PROMPT_SLOT_IDS.memo,
      DEFAULT,
    );
    expect(merged).toBe(DEFAULT);
  });

  it("listResolvedPromptSlots reflects current customizations", async () => {
    const store = await loadStore();
    const resolver = await loadResolver();

    await store.setPromptCustomization(PROMPT_SLOT_IDS.clientProfile, {
      mode: "replace",
      text: "TOTALLY NEW PROMPT",
    });

    const slots = await resolver.listResolvedPromptSlots();
    const clientProfile = slots.find(
      (s) => s.id === PROMPT_SLOT_IDS.clientProfile,
    );
    expect(clientProfile).toBeDefined();
    expect(clientProfile!.customization?.mode).toBe("replace");
    expect(clientProfile!.effectivePrompt).toBe("TOTALLY NEW PROMPT");

    const memo = slots.find((s) => s.id === PROMPT_SLOT_IDS.memo);
    expect(memo).toBeDefined();
    expect(memo!.customization).toBeNull();
    expect(memo!.effectivePrompt).toBe(memo!.defaultPrompt);
  });

  it("ignores unknown slot ids that are present in stored data", async () => {
    const store = await loadStore();
    // Manually plant a stale slot id directly in the kv store to simulate
    // a customization left over from a previous version of the registry.
    const { getKvAdapter } = await import("@/lib/db");
    await getKvAdapter().set("prompts:settings:v1", {
      [PROMPT_SLOT_IDS.memo]: {
        mode: "append",
        text: "still valid",
        updatedAt: new Date().toISOString(),
      },
      "legacy.removed.slot": {
        mode: "append",
        text: "should be dropped",
        updatedAt: new Date().toISOString(),
      },
    });

    const all = await store.getPromptCustomizations();
    expect(Object.keys(all)).toEqual([PROMPT_SLOT_IDS.memo]);
  });
});
