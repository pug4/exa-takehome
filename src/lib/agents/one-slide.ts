import type { OneSlideSummaryResult } from "@/types/research";
import { exaSearchStructured } from "../exa";
import { ONE_SLIDE_SYSTEM_PROMPT } from "../prompts/defaults";
import { PROMPT_SLOT_IDS } from "../prompts/registry";
import { resolveSystemPrompt } from "../prompts/resolve";
import { buildResearchContext } from "./context";
import type { AgentDefinition } from "./base";

const schema = {
  type: "object",
  description: "A clean, client-ready one-slide summary in Markdown.",
  properties: {
    title: { type: "string" },
    clientPositioning: { type: "string" },
    competitiveLandscape: {
      type: "array",
      items: { type: "string" },
      description: "3-6 short bullets describing the competitive landscape",
    },
    emergingPlayers: {
      type: "array",
      items: { type: "string" },
      description: "3-5 short bullets on emerging or adjacent players",
    },
    marketSignals: {
      type: "array",
      items: { type: "string" },
      description: "3-5 short bullets on recent market signals",
    },
    strategicQuestions: {
      type: "array",
      items: { type: "string" },
      description: "3-5 strategic questions for the client",
    },
    recommendedNextSteps: {
      type: "array",
      items: { type: "string" },
      description: "3-5 recommended next steps",
    },
    markdown: {
      type: "string",
      description:
        "A complete client-ready slide in Markdown that can be pasted into a deck.",
    },
  },
  required: [
    "title",
    "clientPositioning",
    "competitiveLandscape",
    "emergingPlayers",
    "marketSignals",
    "strategicQuestions",
    "recommendedNextSteps",
    "markdown",
  ],
  additionalProperties: false,
} as const;

export const oneSlideAgent: AgentDefinition<"oneSlideSummary"> = {
  type: "oneSlideSummary",
  label: "One-Slide Summary",
  description: "Tight, client-ready one-slide synthesis of the engagement.",
  run: async (ctx) => {
    const context = buildResearchContext(ctx);
    const profile = ctx.results.clientProfile;
    const clientName =
      profile?.companyName ?? ctx.engagement.projectName ?? ctx.engagement.clientUrl;

    const query = `Produce a clean, client-ready one-slide summary in Markdown for the engagement below. Title: "Market Map: ${clientName}". Each section must be tight (max 1-2 sentences per bullet). The markdown field should be a complete slide that can be pasted into a deck.\n\nResearch context:\n${context}`;

    const systemPrompt = await resolveSystemPrompt(
      PROMPT_SLOT_IDS.oneSlide,
      ONE_SLIDE_SYSTEM_PROMPT,
    );

    const { data, citations } =
      await exaSearchStructured<OneSlideSummaryResult>(query, schema as never, {
        type: "deep",
        numResults: 8,
        contents: { highlights: true },
        systemPrompt,
      });

    return {
      data: data ?? {
        title: `Market Map: ${clientName}`,
        clientPositioning: "",
        competitiveLandscape: [],
        emergingPlayers: [],
        marketSignals: [],
        strategicQuestions: [],
        recommendedNextSteps: [],
        markdown: "",
      },
      citations,
    };
  },
};
