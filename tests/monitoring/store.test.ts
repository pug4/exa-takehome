import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Engagement } from "@/types/engagement";
import type {
  Monitor,
  MonitorFinding,
  MonitorRunSummary,
} from "@/types/monitoring";

// Each test starts from a clean in-memory adapter.
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete (globalThis as { __EXA_MEMORY_STORE__?: unknown })
    .__EXA_MEMORY_STORE__;
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as { __EXA_MEMORY_STORE__?: unknown })
    .__EXA_MEMORY_STORE__;
});

const NOW = "2025-01-01T00:00:00.000Z";

function makeEngagement(id: string): Engagement {
  return {
    id,
    projectName: "Test Engagement",
    clientUrl: "https://example.com",
    clientName: "Example Co",
    industry: "SaaS",
    geography: "Global",
    knownCompetitors: ["https://rival.com"],
    notes: "",
    status: "created",
    createdAt: NOW,
    updatedAt: NOW,
    agents: {
      clientProfile: "pending",
      competitors: "pending",
      deepCompetitiveAnalysis: "pending",
      emergingPlayers: "pending",
      marketSignals: "pending",
      customerSegments: "pending",
      discoveryQuestions: "pending",
      expertCalls: "pending",
      memo: "pending",
      oneSlideSummary: "pending",
    },
  };
}

function makeFinding(
  monitor: Monitor,
  overrides: Partial<MonitorFinding> = {},
): MonitorFinding {
  const id = overrides.id ?? `find_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    engagementId: monitor.engagementId,
    monitorRunId: "mrun_test",
    source: monitor.sources[0],
    title: "Sample finding",
    summary: "Something happened.",
    url: `https://news.example/${id}`,
    publishedDate: null,
    kind: "news",
    severity: "info",
    discoveredAt: new Date().toISOString(),
    read: false,
    ...overrides,
  };
}

describe("monitoring/store + lifecycle", () => {
  it("createMonitorForEngagement seeds sources from the engagement", async () => {
    const lifecycle = await import("@/lib/monitoring/lifecycle");
    const store = await import("@/lib/monitoring/store");
    const engagement = makeEngagement("eng_lifecycle");

    const monitor = await lifecycle.createMonitorForEngagement(engagement);
    expect(monitor.sources.map((s) => s.kind)).toEqual([
      "client",
      "competitor",
    ]);
    expect(monitor.enabled).toBe(true);
    expect(monitor.intervalMinutes).toBeGreaterThanOrEqual(15);

    const reloaded = await store.getMonitor("eng_lifecycle");
    expect(reloaded?.sources).toHaveLength(2);
  });

  it("listAllMonitors returns every saved monitor", async () => {
    const lifecycle = await import("@/lib/monitoring/lifecycle");
    const store = await import("@/lib/monitoring/store");

    await lifecycle.createMonitorForEngagement(makeEngagement("eng_a"));
    await lifecycle.createMonitorForEngagement(makeEngagement("eng_b"));

    const all = await store.listAllMonitors();
    const ids = all.map((m) => m.engagementId).sort();
    expect(ids).toEqual(["eng_a", "eng_b"]);
  });

  it("saveFinding + listFindings preserves discovery order (newest first)", async () => {
    const lifecycle = await import("@/lib/monitoring/lifecycle");
    const store = await import("@/lib/monitoring/store");

    const monitor = await lifecycle.createMonitorForEngagement(
      makeEngagement("eng_findings"),
    );

    const a = makeFinding(monitor, {
      id: "f_a",
      url: "https://news.example/a",
      discoveredAt: "2025-01-01T00:00:00.000Z",
    });
    const b = makeFinding(monitor, {
      id: "f_b",
      url: "https://news.example/b",
      discoveredAt: "2025-01-02T00:00:00.000Z",
    });
    const c = makeFinding(monitor, {
      id: "f_c",
      url: "https://news.example/c",
      discoveredAt: "2025-01-01T12:00:00.000Z",
    });

    await store.saveFinding(a);
    await store.saveFinding(b);
    await store.saveFinding(c);

    const listed = await store.listFindings("eng_findings");
    expect(listed.map((f) => f.id)).toEqual(["f_b", "f_c", "f_a"]);
  });

  it("listGlobalFindings joins findings across engagements newest-first", async () => {
    const lifecycle = await import("@/lib/monitoring/lifecycle");
    const store = await import("@/lib/monitoring/store");

    const m1 = await lifecycle.createMonitorForEngagement(
      makeEngagement("eng_1"),
    );
    const m2 = await lifecycle.createMonitorForEngagement(
      makeEngagement("eng_2"),
    );

    await store.saveFinding(
      makeFinding(m1, {
        id: "f_old",
        url: "https://x.example/old",
        discoveredAt: "2025-01-01T00:00:00.000Z",
      }),
    );
    await store.saveFinding(
      makeFinding(m2, {
        id: "f_new",
        url: "https://x.example/new",
        discoveredAt: "2025-01-02T00:00:00.000Z",
      }),
    );

    const global = await store.listGlobalFindings();
    expect(global.map((g) => g.finding.id)).toEqual(["f_new", "f_old"]);
    expect(global[0].engagementId).toBe("eng_2");
    expect(global[1].engagementId).toBe("eng_1");
  });

  it("markFindingRead and markAllFindingsRead are idempotent", async () => {
    const lifecycle = await import("@/lib/monitoring/lifecycle");
    const store = await import("@/lib/monitoring/store");

    const monitor = await lifecycle.createMonitorForEngagement(
      makeEngagement("eng_read"),
    );
    const finding = makeFinding(monitor, { id: "f_read" });
    await store.saveFinding(finding);

    const first = await store.markFindingRead("eng_read", "f_read");
    expect(first?.read).toBe(true);

    // Calling again is a no-op (still read, nothing thrown).
    const second = await store.markFindingRead("eng_read", "f_read");
    expect(second?.read).toBe(true);

    expect(
      await store.markFindingRead("eng_read", "missing_id"),
    ).toBeNull();

    // Add another unread, then mark-all.
    await store.saveFinding(
      makeFinding(monitor, { id: "f_other", url: "https://x.example/other" }),
    );
    const updated = await store.markAllFindingsRead("eng_read");
    expect(updated).toBe(1);
    const updatedAgain = await store.markAllFindingsRead("eng_read");
    expect(updatedAgain).toBe(0);

    const all = await store.listFindings("eng_read");
    expect(all.every((f) => f.read)).toBe(true);
  });

  it("recordSeenUrls dedupes and caps", async () => {
    const lifecycle = await import("@/lib/monitoring/lifecycle");
    const store = await import("@/lib/monitoring/store");

    await lifecycle.createMonitorForEngagement(makeEngagement("eng_seen"));
    await store.recordSeenUrls("eng_seen", [
      "https://a.example",
      "https://b.example",
    ]);
    await store.recordSeenUrls("eng_seen", [
      "https://b.example",
      "https://c.example",
    ]);

    const seen = await store.getSeenUrls("eng_seen");
    expect(new Set(seen)).toEqual(
      new Set([
        "https://a.example",
        "https://b.example",
        "https://c.example",
      ]),
    );
    // Insertion order: latest-first puts c before b before a.
    expect(seen).toEqual([
      "https://b.example",
      "https://c.example",
      "https://a.example",
    ]);
  });

  it("appendRunSummary + listRecentRuns returns newest-first", async () => {
    const lifecycle = await import("@/lib/monitoring/lifecycle");
    const store = await import("@/lib/monitoring/store");

    await lifecycle.createMonitorForEngagement(makeEngagement("eng_runs"));

    const mkRun = (n: number): MonitorRunSummary => ({
      engagementId: "eng_runs",
      monitorRunId: `mrun_${n}`,
      startedAt: `2025-01-0${n}T00:00:00.000Z`,
      completedAt: `2025-01-0${n}T00:00:01.000Z`,
      sourcesScanned: 2,
      newFindings: n,
      errors: [],
    });

    await store.appendRunSummary(mkRun(1));
    await store.appendRunSummary(mkRun(2));
    await store.appendRunSummary(mkRun(3));

    const runs = await store.listRecentRuns("eng_runs", 5);
    expect(runs.map((r) => r.monitorRunId)).toEqual([
      "mrun_3",
      "mrun_2",
      "mrun_1",
    ]);
  });

  it("syncMonitorWithCompetitors only adds approved competitor sources", async () => {
    const lifecycle = await import("@/lib/monitoring/lifecycle");
    const store = await import("@/lib/monitoring/store");

    const monitor = await lifecycle.createMonitorForEngagement(
      makeEngagement("eng_sync"),
    );
    const initialCount = monitor.sources.length;

    const added = await lifecycle.syncMonitorWithCompetitors("eng_sync", {
      id: "res",
      engagementId: "eng_sync",
      type: "competitors",
      status: "complete",
      createdAt: NOW,
      updatedAt: NOW,
      data: {
        competitors: [
          {
            name: "Direct High",
            websiteUrl: "https://direct.example",
            competitorType: "direct",
            shortDescription: "",
            whyTheyCompete: "",
            overlappingCustomerSegments: [],
            evidenceUrls: [],
            confidenceLevel: "high",
          },
          {
            name: "Low Confidence Guess",
            websiteUrl: "https://noisy.example",
            competitorType: "low_confidence",
            shortDescription: "",
            whyTheyCompete: "",
            overlappingCustomerSegments: [],
            evidenceUrls: [],
            confidenceLevel: "low",
          },
          {
            // Already monitored as the seeded knownCompetitor.
            name: "Rival",
            websiteUrl: "https://rival.com",
            competitorType: "direct",
            shortDescription: "",
            whyTheyCompete: "",
            overlappingCustomerSegments: [],
            evidenceUrls: [],
            confidenceLevel: "high",
          },
        ],
      },
    });

    expect(added).toBe(1);
    const reloaded = await store.getMonitor("eng_sync");
    expect(reloaded?.sources).toHaveLength(initialCount + 1);
    expect(reloaded?.sources.at(-1)?.url).toBe("https://direct.example");
    expect(reloaded?.sources.at(-1)?.kind).toBe("competitor");
  });

  it("syncMonitorWithEmergingPlayers tags additions as 'emerging' and dedupes vs competitors", async () => {
    const lifecycle = await import("@/lib/monitoring/lifecycle");
    const store = await import("@/lib/monitoring/store");

    const monitor = await lifecycle.createMonitorForEngagement(
      makeEngagement("eng_emerging"),
    );
    const initialCount = monitor.sources.length;

    // First add a real competitor so we can verify the emerging-players
    // sync doesn't try to re-add the same domain with a different kind.
    await lifecycle.syncMonitorWithCompetitors("eng_emerging", {
      id: "res_c",
      engagementId: "eng_emerging",
      type: "competitors",
      status: "complete",
      createdAt: NOW,
      updatedAt: NOW,
      data: {
        competitors: [
          {
            name: "Overlap Corp",
            websiteUrl: "https://overlap.example",
            competitorType: "direct",
            shortDescription: "",
            whyTheyCompete: "",
            overlappingCustomerSegments: [],
            evidenceUrls: [],
            confidenceLevel: "high",
          },
        ],
      },
    });

    const added = await lifecycle.syncMonitorWithEmergingPlayers(
      "eng_emerging",
      {
        id: "res_e",
        engagementId: "eng_emerging",
        type: "emergingPlayers",
        status: "complete",
        createdAt: NOW,
        updatedAt: NOW,
        data: {
          emergingPlayers: [
            {
              name: "Adjacent Newcomer",
              websiteUrl: "https://adjacent.example",
              category: "adjacent_player",
              whyRelevant: "",
              relationshipToClient: "",
              threatLevel: "medium",
              evidenceUrls: [],
              confidenceLevel: "high",
            },
            {
              // Same domain as the competitor above — should be skipped
              // and keep its `competitor` kind.
              name: "Overlap Corp",
              websiteUrl: "https://overlap.example",
              category: "emerging_direct_threat",
              whyRelevant: "",
              relationshipToClient: "",
              threatLevel: "high",
              evidenceUrls: [],
              confidenceLevel: "high",
            },
            {
              name: "Low Conf Guess",
              websiteUrl: "https://noisy.example",
              category: "substitute",
              whyRelevant: "",
              relationshipToClient: "",
              threatLevel: "low",
              evidenceUrls: [],
              confidenceLevel: "low",
            },
          ],
        },
      },
    );

    expect(added).toBe(1);
    const reloaded = await store.getMonitor("eng_emerging");
    expect(reloaded?.sources).toHaveLength(initialCount + 2);
    const overlap = reloaded?.sources.find((s) =>
      s.url.includes("overlap.example"),
    );
    expect(overlap?.kind).toBe("competitor");
    const adjacent = reloaded?.sources.find((s) =>
      s.url.includes("adjacent.example"),
    );
    expect(adjacent?.kind).toBe("emerging");
  });

  it("syncMonitorWithEmergingPlayers is a no-op when the result is missing or empty", async () => {
    const lifecycle = await import("@/lib/monitoring/lifecycle");
    await lifecycle.createMonitorForEngagement(makeEngagement("eng_noop"));

    expect(
      await lifecycle.syncMonitorWithEmergingPlayers("eng_noop", undefined),
    ).toBe(0);
    expect(
      await lifecycle.syncMonitorWithEmergingPlayers("eng_noop", {
        id: "res",
        engagementId: "eng_noop",
        type: "emergingPlayers",
        status: "complete",
        createdAt: NOW,
        updatedAt: NOW,
        data: { emergingPlayers: [] },
      }),
    ).toBe(0);
  });
});
