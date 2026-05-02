import type { DeepAnalysisResult } from "@/types/research";
import { dedupeCitations, exaSearchStructured } from "../exa";
import { DEEP_ANALYSIS_SYSTEM_PROMPT } from "../prompts/defaults";
import { PROMPT_SLOT_IDS } from "../prompts/registry";
import { resolveSystemPrompt } from "../prompts/resolve";
import { getDomain, normalizeUrl } from "../url";
import type { AgentDefinition } from "./base";

const schema = {
  type: "object",
  description: "Deep competitive analysis profiles for one or more competitors.",
  properties: {
    competitorProfiles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          url: { type: "string" },
          positioning: {
            type: "string",
            description:
              "Positioning, target customers, and GTM motion in 3-6 sentences.",
          },
          productOrServiceOffering: {
            type: "array",
            items: { type: "string" },
          },
          differentiators: {
            type: "array",
            items: { type: "string" },
            description: "Key differentiators and customer proof points.",
          },
          pricingSignals: {
            type: "string",
            description:
              "Pricing signals plus any visible weaknesses or gaps.",
          },
          weaknessesOrGaps: { type: "array", items: { type: "string" } },
          evidenceUrls: { type: "array", items: { type: "string" } },
        },
        required: [
          "name",
          "url",
          "positioning",
          "productOrServiceOffering",
          "differentiators",
          "evidenceUrls",
        ],
      },
    },
    summary: {
      type: "string",
      description:
        "Client-vs-competitor comparison plus strategic implications in 4-8 sentences.",
    },
  },
  required: ["competitorProfiles", "summary"],
  additionalProperties: false,
} as const;

import type { Engagement } from "@/types/engagement";
import type { AgentDataMap } from "@/types/research";
import type { ExaCitation } from "../exa";

export interface DeepAnalysisInput {
  engagement: Engagement;
  competitorUrls: string[];
  clientProfile?: AgentDataMap["clientProfile"];
}

export async function runDeepAnalysis(
  input: DeepAnalysisInput,
): Promise<{ data: DeepAnalysisResult; citations: ExaCitation[] }> {
  const urls = [...new Set(input.competitorUrls.map(normalizeUrl))].filter(
    Boolean,
  );
  if (urls.length === 0) {
    return {
      data: {
        competitorProfiles: [],
        summary: "",
      },
      citations: [],
    };
  }
  const includeDomains = urls.map(getDomain);

  const profileSummary = input.clientProfile
    ? `Client: ${input.clientProfile.companyName} (${input.clientProfile.category}). Positioning: ${input.clientProfile.positioningSummary}. Target customers: ${input.clientProfile.targetCustomers.join(", ")}. Products/services: ${input.clientProfile.productsOrServices.join(", ")}.`
    : `Client URL: ${input.engagement.clientUrl}.`;

  const query = `Perform a deep competitive teardown of these competitors: ${urls.join(", ")}. For each, analyze positioning, product/service offering, target customers, pricing signals, go-to-market motion, customer proof, differentiators, messaging themes, partnerships, and weaknesses or gaps. Then compare them against the client and produce strategic implications.\n\n${profileSummary}`;

  const systemPrompt = await resolveSystemPrompt(
    PROMPT_SLOT_IDS.deepAnalysis,
    DEEP_ANALYSIS_SYSTEM_PROMPT,
  );

  const { data, citations } = await exaSearchStructured<DeepAnalysisResult>(
    query,
    schema as never,
    {
      type: "deep",
      numResults: Math.min(40, Math.max(10, urls.length * 6)),
      includeDomains,
      contents: { text: { maxCharacters: 4000 } },
      systemPrompt,
    },
  );

  return {
    data: data ?? {
      competitorProfiles: [],
      summary: "",
    },
    citations: dedupeCitations(citations),
  };
}

export const deepAnalysisAgent: AgentDefinition<"deepCompetitiveAnalysis"> = {
  type: "deepCompetitiveAnalysis",
  label: "Deep Competitive Analysis",
  description:
    "Detailed teardown of consultant-supplied competitor URLs vs the client.",
  run: async (ctx) => {
    const fromKnown = ctx.engagement.knownCompetitors ?? [];
    const fromList = (ctx.results.competitors?.competitors ?? [])
      .slice(0, 3)
      .map((c) => c.websiteUrl);
    const urls = [...new Set([...fromKnown, ...fromList])];

    if (urls.length === 0) {
      return {
        data: {
          competitorProfiles: [],
          summary:
            "No competitor URLs provided. Add competitor URLs in the Deep Analysis tab to run this agent.",
        },
        citations: [],
      };
    }

    return runDeepAnalysis({
      engagement: ctx.engagement,
      competitorUrls: urls,
      clientProfile: ctx.results.clientProfile,
    });
  },
};
