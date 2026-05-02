import type { EmergingPlayersResult } from "@/types/research";
import { exaSearchStructured } from "../exa";
import { EMERGING_PLAYERS_SYSTEM_PROMPT } from "../prompts/defaults";
import { PROMPT_SLOT_IDS } from "../prompts/registry";
import { resolveSystemPrompt } from "../prompts/resolve";
import type { AgentDefinition } from "./base";

const schema = {
  type: "object",
  description: "Emerging companies and adjacent players near the client market.",
  properties: {
    emergingPlayers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          websiteUrl: { type: "string" },
          category: {
            type: "string",
            enum: [
              "emerging_direct_threat",
              "adjacent_player",
              "substitute",
              "ecosystem_partner",
            ],
          },
          whyRelevant: { type: "string" },
          relationshipToClient: { type: "string" },
          threatLevel: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          evidenceUrls: { type: "array", items: { type: "string" } },
          confidenceLevel: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
        },
        required: [
          "name",
          "websiteUrl",
          "category",
          "whyRelevant",
          "relationshipToClient",
          "threatLevel",
          "evidenceUrls",
          "confidenceLevel",
        ],
      },
    },
  },
  required: ["emergingPlayers"],
  additionalProperties: false,
} as const;

export const emergingPlayersAgent: AgentDefinition<"emergingPlayers"> = {
  type: "emergingPlayers",
  label: "Emerging & Adjacent Players",
  description: "Finds non-obvious adjacent companies and emerging entrants.",
  run: async (ctx) => {
    const profile = ctx.results.clientProfile;
    const category =
      profile?.category || ctx.engagement.industry || "this category";
    const products = profile?.productsOrServices?.slice(0, 3).join(", ") ?? "";

    const query = `Find non-obvious emerging companies, adjacent players, substitute products, AI-native disruptors, and recently funded startups near the market of ${profile?.companyName ?? ctx.engagement.clientUrl} in ${category}${products ? ` (${products})` : ""}. Separate them into emerging direct threats, adjacent players, substitutes, and ecosystem partners. Include lesser-known startups, vertical software, marketplaces, and recently funded companies.`;

    const systemPrompt = await resolveSystemPrompt(
      PROMPT_SLOT_IDS.emergingPlayers,
      EMERGING_PLAYERS_SYSTEM_PROMPT,
    );

    const { data, citations } = await exaSearchStructured<EmergingPlayersResult>(
      query,
      schema as never,
      {
        type: "deep",
        numResults: 20,
        category: "company",
        contents: { text: { maxCharacters: 2000 } },
        systemPrompt,
      },
    );

    return {
      data: data ?? { emergingPlayers: [] },
      citations,
    };
  },
};
