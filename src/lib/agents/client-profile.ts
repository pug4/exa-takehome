import type { ClientProfile } from "@/types/research";
import { exaSearchStructured } from "../exa";
import { CLIENT_PROFILE_SYSTEM_PROMPT } from "../prompts/defaults";
import { PROMPT_SLOT_IDS } from "../prompts/registry";
import { resolveSystemPrompt } from "../prompts/resolve";
import { getDomain, normalizeUrl } from "../url";
import type { AgentDefinition } from "./base";

const schema = {
  type: "object",
  description:
    "A structured profile of the client company derived from their website.",
  properties: {
    companyName: { type: "string", description: "Name of the company" },
    websiteUrl: { type: "string" },
    category: {
      type: "string",
      description: "The market category or segment the company operates in.",
    },
    positioningSummary: {
      type: "string",
      description: "A 2-4 sentence summary of how the company positions itself.",
    },
    productsOrServices: {
      type: "array",
      items: { type: "string" },
      description: "Products or services the company offers.",
    },
    targetCustomers: {
      type: "array",
      items: { type: "string" },
      description: "Customer types the company appears to serve.",
    },
    claims: {
      type: "array",
      items: { type: "string" },
      description:
        "Key value claims the company makes (including pain points addressed).",
    },
    evidenceUrls: {
      type: "array",
      items: { type: "string" },
      description: "URLs supporting the conclusions.",
    },
    confidenceLevel: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
      description:
        "Inferences or assumptions where direct evidence is thin, plus visible customer proof or testimonials.",
    },
  },
  required: [
    "companyName",
    "websiteUrl",
    "category",
    "positioningSummary",
    "productsOrServices",
    "targetCustomers",
    "evidenceUrls",
    "confidenceLevel",
  ],
  additionalProperties: false,
} as const;

export const clientProfileAgent: AgentDefinition<"clientProfile"> = {
  type: "clientProfile",
  label: "Client Website Understanding",
  description:
    "Analyzes the client website to extract category, positioning, products, and target customers.",
  run: async (ctx) => {
    const url = normalizeUrl(ctx.engagement.clientUrl);
    const domain = getDomain(url);
    const query = `Analyze the company website at ${url}. What does this company do, who do they serve, what category are they in, what products and services do they offer, what pain points do they claim to solve, and what positioning language do they use? Use the homepage, about page, products/services, pricing, customer pages, and case studies.`;

    const systemPrompt = await resolveSystemPrompt(
      PROMPT_SLOT_IDS.clientProfile,
      CLIENT_PROFILE_SYSTEM_PROMPT,
    );

    const { data, citations } = await exaSearchStructured<ClientProfile>(
      query,
      schema as never,
      {
        type: "deep-lite",
        numResults: 12,
        includeDomains: [domain],
        contents: {
          text: { maxCharacters: 4000 },
          highlights: { query: "positioning, customers, products, services" },
        },
        systemPrompt,
      },
    );

    if (!data) {
      throw new Error("Exa did not return a structured client profile");
    }

    return {
      data: { ...data, websiteUrl: data.websiteUrl || url },
      citations,
    };
  },
};
