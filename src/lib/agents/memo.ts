import type { MemoResult } from "@/types/research";
import {
  dedupeCitations,
  streamExaSearch,
  type ExaCitation,
} from "../exa";
import { MEMO_SYSTEM_PROMPT } from "../prompts/defaults";
import { PROMPT_SLOT_IDS } from "../prompts/registry";
import { resolveSystemPrompt } from "../prompts/resolve";
import { buildResearchContext } from "./context";
import type { AgentDefinition } from "./base";

const PROGRESS_THROTTLE_MS = 750;

export const memoAgent: AgentDefinition<"memo"> = {
  type: "memo",
  label: "Research Memo",
  description: "First-pass consulting research memo synthesizing all agents.",
  run: async (ctx) => {
    const context = buildResearchContext(ctx);
    const profile = ctx.results.clientProfile;
    const clientName =
      profile?.companyName ??
      ctx.engagement.projectName ??
      ctx.engagement.clientUrl;

    const query = `Write a first-pass consulting research memo for the client engagement below. Use Markdown headings. Be concise, structured, professional, and label assumptions where evidence is thin. Do not overstate certainty.\n\nThe memo MUST include the following sections (in this order):\n1. # Market Map Memo: ${clientName}\n2. ## Executive Summary\n3. ## Client Positioning\n4. ## Market Definition\n5. ## Competitive Landscape (table: Competitor | Type | Why Relevant | Evidence)\n6. ## Emerging / Adjacent Players\n7. ## Recent Market Signals\n8. ## Customer Segments\n9. ## Strategic Implications\n10. ## Recommended Discovery Questions\n11. ## Suggested Expert Calls\n12. ## Appendix: Evidence URLs (a flat bulleted list of unique URLs from the research)\n\nResearch context:\n${context}`;

    let markdown = "";
    let citations: ExaCitation[] = [];
    let lastEmit = 0;

    const systemPrompt = await resolveSystemPrompt(
      PROMPT_SLOT_IDS.memo,
      MEMO_SYSTEM_PROMPT,
    );

    for await (const chunk of streamExaSearch({
      query,
      type: "deep",
      // {type: "text"} streams plain markdown deltas in choices[0].delta.content,
      // avoiding any need to parse partial JSON from a structured outputSchema.
      outputSchema: { type: "text", description: "Markdown consulting memo" },
      systemPrompt,
      contents: { highlights: true },
    })) {
      markdown = chunk.partialAnswer;
      citations = chunk.citations;

      const now = Date.now();
      if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
        lastEmit = now;
        await ctx.emit({
          agent: "memo",
          type: "agent_progress",
          message: `Drafting memo (${markdown.length} chars)…`,
          data: { length: markdown.length },
        });
      }
    }

    return {
      data: { markdown } satisfies MemoResult,
      citations: dedupeCitations(citations),
    };
  },
};
