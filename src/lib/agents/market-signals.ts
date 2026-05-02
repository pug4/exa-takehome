import type { MarketSignalsResult } from "@/types/research";
import { exaSearchStructured } from "../exa";
import { MARKET_SIGNALS_SYSTEM_PROMPT } from "../prompts/defaults";
import { PROMPT_SLOT_IDS } from "../prompts/registry";
import { resolveSystemPrompt } from "../prompts/resolve";
import type { AgentDefinition } from "./base";

const schema = {
  type: "object",
  description: "Recent market signals affecting the client's category.",
  properties: {
    marketSignals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          signal: { type: "string" },
          signalType: {
            type: "string",
            enum: [
              "demand_trend",
              "funding",
              "ma",
              "regulation",
              "product_launch",
              "hiring",
              "pricing_change",
              "partnership",
              "tech_shift",
              "macro",
            ],
          },
          whyItMatters: { type: "string" },
          affectedPlayers: { type: "array", items: { type: "string" } },
          implicationForClient: { type: "string" },
          date: { type: "string" },
          evidenceUrls: { type: "array", items: { type: "string" } },
          confidenceLevel: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
        },
        required: [
          "signal",
          "signalType",
          "whyItMatters",
          "implicationForClient",
          "evidenceUrls",
          "confidenceLevel",
        ],
      },
    },
  },
  required: ["marketSignals"],
  additionalProperties: false,
} as const;

export const marketSignalsAgent: AgentDefinition<"marketSignals"> = {
  type: "marketSignals",
  label: "Market Signals",
  description:
    "Recent funding, M&A, regulation, product launches, and trend signals.",
  run: async (ctx) => {
    const profile = ctx.results.clientProfile;
    const category =
      profile?.category || ctx.engagement.industry || "this category";
    const products = profile?.productsOrServices?.slice(0, 3).join(", ") ?? "";

    const query = `Find recent (last 18 months) market signals in ${category}${products ? ` (including ${products})` : ""} relevant to ${profile?.companyName ?? ctx.engagement.clientUrl}. Include: funding announcements, M&A, regulatory changes, product launches, hiring patterns, pricing changes, partnerships, technology shifts, and demand trends. For each signal explain why it matters and what it implies for the client.`;

    const since = new Date();
    since.setMonth(since.getMonth() - 18);

    const systemPrompt = await resolveSystemPrompt(
      PROMPT_SLOT_IDS.marketSignals,
      MARKET_SIGNALS_SYSTEM_PROMPT,
    );

    const { data, citations } = await exaSearchStructured<MarketSignalsResult>(
      query,
      schema as never,
      {
        type: "deep",
        numResults: 20,
        category: "news",
        startPublishedDate: since.toISOString(),
        contents: {
          text: { maxCharacters: 2500 },
          highlights: { query: "funding regulation product launch trend" },
        },
        systemPrompt,
      },
    );

    return {
      data: data ?? { marketSignals: [] },
      citations,
    };
  },
};
