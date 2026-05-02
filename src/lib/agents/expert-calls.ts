import type { ExpertCallsResult } from "@/types/research";
import { exaSearchStructured } from "../exa";
import { EXPERT_CALLS_SYSTEM_PROMPT } from "../prompts/defaults";
import { PROMPT_SLOT_IDS } from "../prompts/registry";
import { resolveSystemPrompt } from "../prompts/resolve";
import { buildResearchContext } from "./context";
import type { AgentDefinition } from "./base";

const schema = {
  type: "object",
  description:
    "Suggested expert-call target profiles, not specific private individuals.",
  properties: {
    expertCallTargets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          targetProfile: { type: "string" },
          whyUseful: { type: "string" },
          idealBackground: { type: "string" },
          sampleQuestions: { type: "array", items: { type: "string" } },
          priority: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: [
          "targetProfile",
          "whyUseful",
          "idealBackground",
          "sampleQuestions",
          "priority",
        ],
      },
    },
  },
  required: ["expertCallTargets"],
  additionalProperties: false,
} as const;

export const expertCallsAgent: AgentDefinition<"expertCalls"> = {
  type: "expertCalls",
  label: "Expert-Call Targets",
  description:
    "Suggests target profiles for expert calls (former execs, buyers, analysts, operators).",
  run: async (ctx) => {
    const context = buildResearchContext(ctx);
    const query = `Suggest expert-call target profiles for a market research process. Do NOT name specific private individuals; describe roles, company types, and profiles. Cover: former executives at competitors, buyers in target customer segments, industry analysts, operators at adjacent companies, procurement leaders, channel partners, former customers, regulatory experts (if relevant), and sales/product leaders in the category. For each target include why useful, ideal background, sample questions, and priority.\n\nResearch context:\n${context}`;

    const systemPrompt = await resolveSystemPrompt(
      PROMPT_SLOT_IDS.expertCalls,
      EXPERT_CALLS_SYSTEM_PROMPT,
    );

    const { data, citations } = await exaSearchStructured<ExpertCallsResult>(
      query,
      schema as never,
      {
        type: "deep",
        numResults: 8,
        contents: { highlights: true },
        systemPrompt,
      },
    );

    return {
      data: data ?? { expertCallTargets: [] },
      citations,
    };
  },
};
