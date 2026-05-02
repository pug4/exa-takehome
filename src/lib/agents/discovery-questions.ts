import type { DiscoveryQuestionsResult } from "@/types/research";
import { exaSearchStructured } from "../exa";
import { DISCOVERY_QUESTIONS_SYSTEM_PROMPT } from "../prompts/defaults";
import { PROMPT_SLOT_IDS } from "../prompts/registry";
import { resolveSystemPrompt } from "../prompts/resolve";
import { buildResearchContext } from "./context";
import type { AgentDefinition } from "./base";

const schema = {
  type: "object",
  description:
    "Discovery questions a strategy consultant should ask the client.",
  properties: {
    recommendedQuestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          theme: { type: "string" },
          whyItMatters: { type: "string" },
          whoToAsk: { type: "string" },
        },
        required: ["question", "theme", "whyItMatters", "whoToAsk"],
      },
    },
  },
  required: ["recommendedQuestions"],
  additionalProperties: false,
} as const;

export const discoveryQuestionsAgent: AgentDefinition<"discoveryQuestions"> = {
  type: "discoveryQuestions",
  label: "Discovery Questions",
  description:
    "Generates first-call discovery questions across market, customer, competition, pricing, and growth.",
  run: async (ctx) => {
    const context = buildResearchContext(ctx);
    const themes = [
      "market definition",
      "customer segmentation",
      "competitive landscape",
      "pricing",
      "sales motion",
      "product roadmap",
      "growth strategy",
      "channel strategy",
      "risks",
      "market expansion",
      "strategic priorities",
    ].join(", ");

    const query = `Generate sharp, specific discovery questions a strategy consultant should ask in the first client call. Cover these themes: ${themes}. Each question should be tied to a theme, explain why it matters, and suggest who to ask.\n\nResearch context:\n${context}`;

    const systemPrompt = await resolveSystemPrompt(
      PROMPT_SLOT_IDS.discoveryQuestions,
      DISCOVERY_QUESTIONS_SYSTEM_PROMPT,
    );

    const { data, citations } =
      await exaSearchStructured<DiscoveryQuestionsResult>(query, schema as never, {
        type: "deep",
        numResults: 8,
        contents: { highlights: true },
        systemPrompt,
      });

    return {
      data: data ?? { recommendedQuestions: [] },
      citations,
    };
  },
};
