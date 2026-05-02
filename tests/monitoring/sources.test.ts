import { describe, expect, it } from "vitest";
import type { Engagement } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import {
  buildInitialSources,
  clampInterval,
  competitorsToSourceCandidates,
  emergingPlayersToSourceCandidates,
  isMonitorDue,
  mergeMonitorSources,
  nextRunAt,
} from "@/lib/monitoring/sources";

const NOW = "2025-01-01T00:00:00.000Z";

function makeEngagement(overrides: Partial<Engagement> = {}): Engagement {
  return {
    id: "eng_test",
    projectName: "Test",
    clientUrl: "https://example.com",
    clientName: "Example Co",
    industry: "SaaS",
    geography: "Global",
    knownCompetitors: [],
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
    ...overrides,
  };
}

describe("monitoring/sources", () => {
  describe("buildInitialSources", () => {
    it("seeds from clientUrl and known competitors in order", () => {
      const sources = buildInitialSources(
        makeEngagement({
          knownCompetitors: ["https://rival.com", "carbon.example"],
        }),
      );

      expect(sources.map((s) => s.kind)).toEqual([
        "client",
        "competitor",
        "competitor",
      ]);
      expect(sources[0].url).toBe("https://example.com");
      expect(sources[0].label).toBe("Example Co");
      expect(sources[1].url).toBe("https://rival.com");
      expect(sources[2].url).toBe("https://carbon.example");
    });

    it("dedupes by canonical URL", () => {
      const sources = buildInitialSources(
        makeEngagement({
          knownCompetitors: [
            "https://rival.com",
            "https://rival.com/",
            "rival.com",
          ],
        }),
      );

      // Three input variants → one client + one deduped competitor.
      expect(sources).toHaveLength(2);
      expect(sources[1].url).toBe("https://rival.com");
    });

    it("falls back to projectName then to the domain when no client name is set", () => {
      const projectFallback = buildInitialSources(
        makeEngagement({ clientName: undefined }),
      );
      expect(projectFallback[0].label).toBe("Test");

      const domainFallback = buildInitialSources(
        makeEngagement({ clientName: undefined, projectName: undefined }),
      );
      expect(domainFallback[0].label).toBe("example.com");
    });

    it("ignores blank competitor entries", () => {
      const sources = buildInitialSources(
        makeEngagement({
          knownCompetitors: ["", "   ", "https://rival.com"],
        }),
      );
      expect(sources).toHaveLength(2);
      expect(sources[1].url).toBe("https://rival.com");
    });
  });

  describe("mergeMonitorSources", () => {
    it("only adds candidates whose domain is not already monitored", () => {
      const existing = buildInitialSources(
        makeEngagement({
          knownCompetitors: ["https://rival.com"],
        }),
      );
      const { sources, addedCount } = mergeMonitorSources(
        existing,
        [
          { url: "https://rival.com/about", name: "Rival" }, // dup domain
          { url: "https://newco.example", name: "Newco" },
        ],
        "competitor",
      );

      expect(addedCount).toBe(1);
      expect(sources).toHaveLength(existing.length + 1);
      expect(sources.at(-1)?.url).toBe("https://newco.example");
      expect(sources.at(-1)?.kind).toBe("competitor");
    });

    it("respects the source cap", () => {
      const existing = buildInitialSources(makeEngagement());
      const candidates = Array.from({ length: 200 }, (_, i) => ({
        url: `https://comp${i}.example`,
        name: `Comp ${i}`,
      }));

      const { sources, addedCount } = mergeMonitorSources(
        existing,
        candidates,
        "competitor",
      );

      expect(sources.length).toBeLessThanOrEqual(30);
      expect(addedCount).toBeLessThanOrEqual(30 - existing.length);
    });

    it("preserves the user-curated label/kind on existing sources", () => {
      const existing = buildInitialSources(
        makeEngagement({ knownCompetitors: ["https://rival.com"] }),
      );
      // Mutate the existing competitor's label to simulate a user edit.
      existing[1].label = "Custom Rival Label";

      const { sources } = mergeMonitorSources(
        existing,
        [{ url: "https://rival.com", name: "Rival From Discovery" }],
        "competitor",
      );

      expect(sources[1].label).toBe("Custom Rival Label");
    });

    it("tags new candidates with the supplied kind", () => {
      const existing = buildInitialSources(makeEngagement());
      const { sources, addedCount } = mergeMonitorSources(
        existing,
        [
          { url: "https://newco.example", name: "Newco" },
          { url: "https://emerging.example", name: "Emerging Inc" },
        ],
        "emerging",
      );

      expect(addedCount).toBe(2);
      expect(sources.slice(-2).map((s) => s.kind)).toEqual([
        "emerging",
        "emerging",
      ]);
      expect(sources.at(-1)?.id).toMatch(/^src_emerging_/);
    });

    it("does not promote an existing competitor to emerging on overlap", () => {
      const existing = buildInitialSources(
        makeEngagement({ knownCompetitors: ["https://rival.com"] }),
      );
      const { sources, addedCount } = mergeMonitorSources(
        existing,
        [
          { url: "https://rival.com", name: "Rival" }, // already a competitor
          { url: "https://newco.example", name: "Newco" },
        ],
        "emerging",
      );

      expect(addedCount).toBe(1);
      expect(sources[1].kind).toBe("competitor");
      expect(sources.at(-1)?.kind).toBe("emerging");
    });
  });

  describe("competitorsToSourceCandidates", () => {
    it("filters out low-confidence and pure low_confidence competitors", () => {
      const result: ResearchResult<"competitors"> = {
        id: "res_1",
        engagementId: "eng_test",
        type: "competitors",
        status: "complete",
        createdAt: NOW,
        updatedAt: NOW,
        data: {
          competitors: [
            {
              name: "Strong Direct",
              websiteUrl: "https://strong.example",
              competitorType: "direct",
              shortDescription: "",
              whyTheyCompete: "",
              overlappingCustomerSegments: [],
              evidenceUrls: [],
              confidenceLevel: "high",
            },
            {
              name: "Weak Guess",
              websiteUrl: "https://weak.example",
              competitorType: "low_confidence",
              shortDescription: "",
              whyTheyCompete: "",
              overlappingCustomerSegments: [],
              evidenceUrls: [],
              confidenceLevel: "low",
            },
            {
              name: "Partial Mid",
              websiteUrl: "https://partial.example",
              competitorType: "partial",
              shortDescription: "",
              whyTheyCompete: "",
              overlappingCustomerSegments: [],
              evidenceUrls: [],
              confidenceLevel: "medium",
            },
          ],
        },
      };

      const candidates = competitorsToSourceCandidates(result);
      expect(candidates.map((c) => c.name)).toEqual([
        "Strong Direct",
        "Partial Mid",
      ]);
    });

    it("returns an empty list for missing or empty results", () => {
      expect(competitorsToSourceCandidates(undefined)).toEqual([]);
      expect(
        competitorsToSourceCandidates({
          id: "res",
          engagementId: "eng",
          type: "competitors",
          status: "complete",
          createdAt: NOW,
          updatedAt: NOW,
          data: { competitors: [] },
        }),
      ).toEqual([]);
    });
  });

  describe("emergingPlayersToSourceCandidates", () => {
    it("includes every category but filters by confidence and sorts by threat", () => {
      const result: ResearchResult<"emergingPlayers"> = {
        id: "res_em",
        engagementId: "eng_test",
        type: "emergingPlayers",
        status: "complete",
        createdAt: NOW,
        updatedAt: NOW,
        data: {
          emergingPlayers: [
            {
              name: "Adjacent Low Conf",
              websiteUrl: "https://adjacent-low.example",
              category: "adjacent_player",
              whyRelevant: "",
              relationshipToClient: "",
              threatLevel: "low",
              evidenceUrls: [],
              confidenceLevel: "low", // dropped
            },
            {
              name: "Low Threat Partner",
              websiteUrl: "https://partner.example",
              category: "ecosystem_partner",
              whyRelevant: "",
              relationshipToClient: "",
              threatLevel: "low",
              evidenceUrls: [],
              confidenceLevel: "high",
            },
            {
              name: "High Threat Disruptor",
              websiteUrl: "https://disruptor.example",
              category: "emerging_direct_threat",
              whyRelevant: "",
              relationshipToClient: "",
              threatLevel: "high",
              evidenceUrls: [],
              confidenceLevel: "high",
            },
            {
              name: "Medium Substitute",
              websiteUrl: "https://substitute.example",
              category: "substitute",
              whyRelevant: "",
              relationshipToClient: "",
              threatLevel: "medium",
              evidenceUrls: [],
              confidenceLevel: "medium",
            },
          ],
        },
      };

      const candidates = emergingPlayersToSourceCandidates(result);
      // Low-confidence dropped; rest sorted high → medium → low threat.
      expect(candidates.map((c) => c.name)).toEqual([
        "High Threat Disruptor",
        "Medium Substitute",
        "Low Threat Partner",
      ]);
    });

    it("returns an empty list for missing or empty results", () => {
      expect(emergingPlayersToSourceCandidates(undefined)).toEqual([]);
      expect(
        emergingPlayersToSourceCandidates({
          id: "res",
          engagementId: "eng",
          type: "emergingPlayers",
          status: "complete",
          createdAt: NOW,
          updatedAt: NOW,
          data: { emergingPlayers: [] },
        }),
      ).toEqual([]);
    });
  });

  describe("clampInterval / nextRunAt", () => {
    it("clamps below the minimum and above the maximum", () => {
      expect(clampInterval(0)).toBeGreaterThanOrEqual(15);
      expect(clampInterval(2)).toBeGreaterThanOrEqual(15);
      expect(clampInterval(99_999_999)).toBeLessThanOrEqual(60 * 24 * 7);
    });

    it("falls back to the default for missing or non-finite values", () => {
      expect(clampInterval(undefined)).toBe(60);
      expect(clampInterval(Number.NaN)).toBe(60);
      // Infinity is non-finite, so we treat it the same as a missing value
      // rather than letting it map to the maximum cap.
      expect(clampInterval(Number.POSITIVE_INFINITY)).toBe(60);
    });

    it("nextRunAt advances the timestamp by the clamped interval", () => {
      const next = nextRunAt(NOW, 60);
      expect(new Date(next).getTime() - new Date(NOW).getTime()).toBe(
        60 * 60 * 1000,
      );
    });
  });

  describe("isMonitorDue", () => {
    const baseMonitor = {
      engagementId: "eng_test",
      enabled: true,
      sources: buildInitialSources(makeEngagement()),
      intervalMinutes: 60,
      nextRunAt: NOW,
      lastRunFindings: 0,
      totalFindings: 0,
      createdAt: NOW,
      updatedAt: NOW,
    } as const;

    it("returns true when nextRunAt is in the past and the monitor is enabled", () => {
      const now = new Date(NOW).getTime() + 60_000;
      expect(isMonitorDue(baseMonitor, now)).toBe(true);
    });

    it("returns false when paused", () => {
      const now = new Date(NOW).getTime() + 60_000;
      expect(isMonitorDue({ ...baseMonitor, enabled: false }, now)).toBe(false);
    });

    it("returns false when no sources are configured", () => {
      const now = new Date(NOW).getTime() + 60_000;
      expect(isMonitorDue({ ...baseMonitor, sources: [] }, now)).toBe(false);
    });

    it("returns false when not yet due", () => {
      const now = new Date(NOW).getTime() - 60_000;
      expect(isMonitorDue(baseMonitor, now)).toBe(false);
    });
  });
});
