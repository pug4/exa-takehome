import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  AgentEvent,
  AgentType,
  Engagement,
} from "@/types/engagement";
import type { ResearchResult } from "@/types/research";

// Captured BEFORE any test mutates process.env. Used by the live suite.
const ORIGINAL_UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const ORIGINAL_UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const HAS_UPSTASH = Boolean(ORIGINAL_UPSTASH_URL && ORIGINAL_UPSTASH_TOKEN);

// Unique prefix per test run so live runs never collide with real engagements
// (or with concurrent CI runs) and leftover keys from a crashed test are easy
// to spot and reap.
const RUN_ID = `vitest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ALL_AGENTS: readonly AgentType[] = [
  "clientProfile",
  "competitors",
  "deepCompetitiveAnalysis",
  "emergingPlayers",
  "marketSignals",
  "customerSegments",
  "discoveryQuestions",
  "expertCalls",
  "memo",
  "oneSlideSummary",
] as const;

function pendingAgentMap(): Engagement["agents"] {
  return ALL_AGENTS.reduce(
    (acc, agent) => {
      acc[agent] = "pending";
      return acc;
    },
    {} as Engagement["agents"],
  );
}

function makeEngagement(
  id: string,
  overrides: Partial<Engagement> = {},
): Engagement {
  const now = new Date().toISOString();
  return {
    id,
    projectName: "Vitest Project",
    clientUrl: "https://example.com",
    clientName: "Example Co",
    industry: "Software",
    geography: "Global",
    knownCompetitors: [],
    notes: "fixture engagement",
    status: "created",
    createdAt: now,
    updatedAt: now,
    agents: pendingAgentMap(),
    ...overrides,
  };
}

function makeClientProfileResult(
  engagementId: string,
): ResearchResult<"clientProfile"> {
  const now = new Date().toISOString();
  return {
    id: `${engagementId}-clientProfile`,
    engagementId,
    type: "clientProfile",
    status: "complete",
    data: {
      companyName: "Example Co",
      websiteUrl: "https://example.com",
      category: "B2B SaaS",
      positioningSummary: "Helps teams do X.",
      productsOrServices: ["Product A"],
      targetCustomers: ["Mid-market"],
      claims: ["Fastest in class"],
      evidenceUrls: ["https://example.com/about"],
      confidenceLevel: "medium",
      assumptions: [],
    },
    citations: [{ url: "https://example.com", title: "Example Co" }],
    createdAt: now,
    updatedAt: now,
  };
}

function makeCompetitorsResult(
  engagementId: string,
): ResearchResult<"competitors"> {
  const now = new Date().toISOString();
  return {
    id: `${engagementId}-competitors`,
    engagementId,
    type: "competitors",
    status: "complete",
    data: {
      competitors: [
        {
          name: "Rival Inc",
          websiteUrl: "https://rival.example",
          competitorType: "direct",
          shortDescription: "A direct competitor.",
          whyTheyCompete: "Same buyers.",
          overlappingCustomerSegments: ["Mid-market"],
          evidenceUrls: ["https://rival.example"],
          confidenceLevel: "high",
        },
      ],
    },
    createdAt: now,
    updatedAt: now,
  };
}

function makeEvent(
  engagementId: string,
  overrides: Partial<AgentEvent> = {},
): AgentEvent {
  return {
    engagementId,
    agent: "orchestrator",
    type: "pipeline_started",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function clearMemoryStore(): void {
  delete (globalThis as { __EXA_MEMORY_STORE__?: unknown })
    .__EXA_MEMORY_STORE__;
}

type DbModule = typeof import("@/lib/db");

/**
 * Run the full DB contract against whichever adapter the supplied `setup`
 * configures. Each test re-imports `@/lib/db` after `setup()` so the module's
 * adapter singleton is freshly chosen based on the current env.
 */
function runDbContract(
  label: string,
  options: {
    setup: () => Promise<void> | void;
    idPrefix: string;
    /**
     * For the live Upstash suite we manually clean up any engagements created
     * during a test, since their data lives in a real shared database.
     */
    autoCleanup: boolean;
  },
): void {
  describe(label, () => {
    const createdIds = new Set<string>();
    let counter = 0;

    function freshId(suffix = ""): string {
      counter += 1;
      const tag = suffix ? `-${suffix}` : "";
      const id = `${options.idPrefix}-${counter}${tag}`;
      createdIds.add(id);
      return id;
    }

    async function loadDb(): Promise<DbModule> {
      vi.resetModules();
      return await import("@/lib/db");
    }

    beforeEach(async () => {
      await options.setup();
    });

    afterEach(async () => {
      if (!options.autoCleanup) {
        createdIds.clear();
        return;
      }
      const db = await loadDb();
      const ids = [...createdIds];
      createdIds.clear();
      await Promise.all(
        ids.map((id) =>
          db.deleteEngagement(id).catch(() => {
            /* best-effort cleanup */
          }),
        ),
      );
    });

    it("round-trips an engagement through saveEngagement/getEngagement", async () => {
      const db = await loadDb();
      const engagement = makeEngagement(freshId("roundtrip"));

      await db.saveEngagement(engagement);
      const fetched = await db.getEngagement(engagement.id);

      expect(fetched).toEqual(engagement);
    });

    it("returns null from getEngagement when the id is unknown", async () => {
      const db = await loadDb();
      const result = await db.getEngagement(`${options.idPrefix}-missing`);
      expect(result).toBeNull();
    });

    it("listEngagements returns saved engagements ordered by createdAt desc", async () => {
      const db = await loadDb();
      const older = makeEngagement(freshId("older"), {
        createdAt: "2024-01-01T00:00:00.000Z",
      });
      const newer = makeEngagement(freshId("newer"), {
        createdAt: "2025-06-01T00:00:00.000Z",
      });

      await db.saveEngagement(older);
      await db.saveEngagement(newer);

      const list = await db.listEngagements();
      const ourIds = list
        .map((e) => e.id)
        .filter((id) => id === older.id || id === newer.id);

      // Newer must come before older — listEngagements is sorted desc.
      expect(ourIds).toEqual([newer.id, older.id]);
    });

    it("deleteEngagement removes the engagement, its results, and its events", async () => {
      const db = await loadDb();
      const id = freshId("delete");
      const engagement = makeEngagement(id);

      await db.saveEngagement(engagement);
      await db.saveResult(id, makeClientProfileResult(id));
      await db.saveResult(id, makeCompetitorsResult(id));
      await db.appendEvent(makeEvent(id, { type: "pipeline_started" }));
      await db.appendEvent(makeEvent(id, { type: "pipeline_completed" }));

      // Sanity check before delete.
      expect(await db.getEngagement(id)).not.toBeNull();
      expect(await db.getResult(id, "clientProfile")).not.toBeNull();
      expect((await db.getEvents(id)).length).toBe(2);

      await db.deleteEngagement(id);
      createdIds.delete(id); // already deleted; skip in afterEach

      expect(await db.getEngagement(id)).toBeNull();
      expect(await db.getResult(id, "clientProfile")).toBeNull();
      expect(await db.getResult(id, "competitors")).toBeNull();
      expect(await db.getEvents(id)).toEqual([]);

      const stillListed = (await db.listEngagements()).some(
        (e) => e.id === id,
      );
      expect(stillListed).toBe(false);
    });

    it("deleteEngagement does not affect other engagements", async () => {
      const db = await loadDb();
      const keepId = freshId("keep");
      const dropId = freshId("drop");

      await db.saveEngagement(makeEngagement(keepId));
      await db.saveEngagement(makeEngagement(dropId));
      await db.saveResult(keepId, makeClientProfileResult(keepId));
      await db.saveResult(dropId, makeClientProfileResult(dropId));

      await db.deleteEngagement(dropId);
      createdIds.delete(dropId);

      expect(await db.getEngagement(keepId)).not.toBeNull();
      expect(await db.getResult(keepId, "clientProfile")).not.toBeNull();
      expect(await db.getEngagement(dropId)).toBeNull();
      expect(await db.getResult(dropId, "clientProfile")).toBeNull();
    });

    it("saveResult/getResult round-trips an agent result", async () => {
      const db = await loadDb();
      const id = freshId("result");
      await db.saveEngagement(makeEngagement(id));

      const result = makeClientProfileResult(id);
      await db.saveResult(id, result);

      const fetched = await db.getResult(id, "clientProfile");
      expect(fetched).toEqual(result);
    });

    it("getResult returns null when no result has been saved", async () => {
      const db = await loadDb();
      const id = freshId("noresult");
      await db.saveEngagement(makeEngagement(id));

      const fetched = await db.getResult(id, "memo");
      expect(fetched).toBeNull();
    });

    it("getAllResults returns every saved result keyed by agent type", async () => {
      const db = await loadDb();
      const id = freshId("all-results");
      await db.saveEngagement(makeEngagement(id));

      const profile = makeClientProfileResult(id);
      const competitors = makeCompetitorsResult(id);
      await db.saveResult(id, profile);
      await db.saveResult(id, competitors);

      const all = await db.getAllResults(id);
      expect(all.clientProfile).toEqual(profile);
      expect(all.competitors).toEqual(competitors);
      expect(all.memo).toBeUndefined();
    });

    it("appendEvent + getEvents preserves insertion order", async () => {
      const db = await loadDb();
      const id = freshId("events");
      await db.saveEngagement(makeEngagement(id));

      const events: AgentEvent[] = [
        makeEvent(id, { type: "pipeline_started", message: "first" }),
        makeEvent(id, {
          agent: "clientProfile",
          type: "agent_started",
          message: "second",
        }),
        makeEvent(id, {
          agent: "clientProfile",
          type: "agent_completed",
          message: "third",
        }),
      ];

      for (const event of events) {
        await db.appendEvent(event);
      }

      const fetched = await db.getEvents(id);
      expect(fetched.map((e) => e.message)).toEqual(["first", "second", "third"]);
    });

    it("getEvents honours the fromIndex offset", async () => {
      const db = await loadDb();
      const id = freshId("events-offset");
      await db.saveEngagement(makeEngagement(id));

      for (let i = 0; i < 4; i += 1) {
        await db.appendEvent(makeEvent(id, { message: `evt-${i}` }));
      }

      const fromTwo = await db.getEvents(id, 2);
      expect(fromTwo.map((e) => e.message)).toEqual(["evt-2", "evt-3"]);
    });

    it("updateAgentStatus mutates a single agent and bumps updatedAt", async () => {
      const db = await loadDb();
      const id = freshId("update-agent");
      const original = makeEngagement(id, {
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });
      await db.saveEngagement(original);

      const updated = await db.updateAgentStatus(id, "memo", "running");

      expect(updated).not.toBeNull();
      expect(updated!.agents.memo).toBe("running");
      expect(updated!.agents.clientProfile).toBe("pending");
      expect(updated!.updatedAt).not.toBe(original.updatedAt);

      // Persisted, not just returned.
      const persisted = await db.getEngagement(id);
      expect(persisted!.agents.memo).toBe("running");
    });

    it("updateAgentStatus returns null for unknown engagements", async () => {
      const db = await loadDb();
      const result = await db.updateAgentStatus(
        `${options.idPrefix}-ghost`,
        "memo",
        "running",
      );
      expect(result).toBeNull();
    });

    it("updateEngagementStatus updates the top-level status and persists it", async () => {
      const db = await loadDb();
      const id = freshId("update-status");
      await db.saveEngagement(
        makeEngagement(id, {
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }),
      );

      const updated = await db.updateEngagementStatus(id, "researching");
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe("researching");
      expect(updated!.updatedAt).not.toBe("2024-01-01T00:00:00.000Z");

      const persisted = await db.getEngagement(id);
      expect(persisted!.status).toBe("researching");
    });

    it("updateEngagementStatus returns null for unknown engagements", async () => {
      const db = await loadDb();
      const result = await db.updateEngagementStatus(
        `${options.idPrefix}-ghost`,
        "complete",
      );
      expect(result).toBeNull();
    });
  });
}

// ---------------------------------------------------------------------------
// In-memory adapter — runs in every environment, no external deps.
// ---------------------------------------------------------------------------

runDbContract("db / MemoryAdapter (unit)", {
  idPrefix: `${RUN_ID}-mem`,
  autoCleanup: false, // memory is wiped between tests anyway
  setup: () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    clearMemoryStore();
  },
});

// ---------------------------------------------------------------------------
// Live Upstash adapter — only runs when REST creds are present in the env.
// Skips cleanly otherwise so CI without secrets stays green.
// ---------------------------------------------------------------------------

const liveSuite = HAS_UPSTASH ? describe : describe.skip;

liveSuite("db / UpstashAdapter (live integration)", () => {
  beforeAll(() => {
    if (!HAS_UPSTASH) return;
    console.log(
      `[db.test] Running live Upstash tests against ${ORIGINAL_UPSTASH_URL} with run id ${RUN_ID}`,
    );
  });

  runDbContract("contract", {
    idPrefix: `${RUN_ID}-upstash`,
    autoCleanup: true,
    setup: () => {
      // Restore env in case an earlier suite cleared it, and ensure no
      // memory-store crumbs leak between adapter switches.
      process.env.UPSTASH_REDIS_REST_URL = ORIGINAL_UPSTASH_URL;
      process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL_UPSTASH_TOKEN;
      clearMemoryStore();
    },
  });

  it("connects to Upstash and persists across module reloads", async () => {
    process.env.UPSTASH_REDIS_REST_URL = ORIGINAL_UPSTASH_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL_UPSTASH_TOKEN;
    clearMemoryStore();

    vi.resetModules();
    const first = await import("@/lib/db");
    const id = `${RUN_ID}-upstash-persist`;
    const engagement = makeEngagement(id, { projectName: "Persistence Probe" });

    await first.saveEngagement(engagement);

    // Re-import — a brand-new adapter instance must still see the data,
    // proving it's actually round-tripping through Upstash and not a
    // process-local Map.
    vi.resetModules();
    clearMemoryStore();
    const second = await import("@/lib/db");

    try {
      const fetched = await second.getEngagement(id);
      expect(fetched).not.toBeNull();
      expect(fetched!.projectName).toBe("Persistence Probe");
    } finally {
      await second.deleteEngagement(id).catch(() => {});
    }
  });
});
