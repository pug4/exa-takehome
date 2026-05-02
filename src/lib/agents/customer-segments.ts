import type { CustomerSegmentsResult } from "@/types/research";
import { exaSearchStructured } from "../exa";
import { CUSTOMER_SEGMENTS_SYSTEM_PROMPT } from "../prompts/defaults";
import { PROMPT_SLOT_IDS } from "../prompts/registry";
import { resolveSystemPrompt } from "../prompts/resolve";
import type { AgentDefinition } from "./base";

const schema = {
  type: "object",
  description: "Likely customer segments and buyer personas.",
  properties: {
    customerSegments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          segment: { type: "string" },
          buyerType: { type: "string" },
          likelyPainPoints: { type: "array", items: { type: "string" } },
          buyingTriggers: { type: "array", items: { type: "string" } },
          objections: { type: "array", items: { type: "string" } },
          verticals: { type: "array", items: { type: "string" } },
        },
        required: [
          "segment",
          "buyerType",
          "likelyPainPoints",
          "buyingTriggers",
        ],
      },
    },
    buyerPersonas: { type: "array", items: { type: "string" } },
    openQuestions: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
  },
  required: ["customerSegments", "buyerPersonas", "openQuestions", "assumptions"],
  additionalProperties: false,
} as const;

export const customerSegmentsAgent: AgentDefinition<"customerSegments"> = {
  type: "customerSegments",
  label: "Customer Segmentation",
  description:
    "Infers customer segments, buyer types, pain points, and buying triggers.",
  run: async (ctx) => {
    const profile = ctx.results.clientProfile;
    const profileSummary = profile
      ? `Company: ${profile.companyName}\nCategory: ${profile.category}\nPositioning: ${profile.positioningSummary}\nProducts/services: ${profile.productsOrServices.join(", ")}\nTarget customers (from website): ${profile.targetCustomers.join(", ")}\nClaims: ${profile.claims.join(", ")}`
      : `Client URL: ${ctx.engagement.clientUrl}`;

    const query = `Given the following client company profile, infer the most likely customer segments and buyer personas. Identify end users, economic buyers, decision makers, influencers, verticals, use cases, pain points, buying triggers, and objections. Be specific. Label assumptions clearly.\n\n${profileSummary}`;

    const systemPrompt = await resolveSystemPrompt(
      PROMPT_SLOT_IDS.customerSegments,
      CUSTOMER_SEGMENTS_SYSTEM_PROMPT,
    );

    const { data, citations } = await exaSearchStructured<CustomerSegmentsResult>(
      query,
      schema as never,
      {
        type: "deep",
        numResults: 10,
        contents: { highlights: true },
        systemPrompt,
      },
    );

    return {
      data: data ?? {
        customerSegments: [],
        buyerPersonas: [],
        openQuestions: [],
        assumptions: [],
      },
      citations,
    };
  },
};
