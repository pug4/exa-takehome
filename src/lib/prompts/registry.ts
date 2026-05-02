import {
  CLIENT_PROFILE_SYSTEM_PROMPT,
  COMPETITORS_DISCOVERY_SYSTEM_PROMPT,
  COMPETITORS_VALIDATION_SYSTEM_PROMPT,
  CUSTOMER_SEGMENTS_SYSTEM_PROMPT,
  DEEP_ANALYSIS_SYSTEM_PROMPT,
  DISCOVERY_QUESTIONS_SYSTEM_PROMPT,
  EMERGING_PLAYERS_SYSTEM_PROMPT,
  EXPERT_CALLS_SYSTEM_PROMPT,
  MARKET_SIGNALS_SYSTEM_PROMPT,
  MEMO_SYSTEM_PROMPT,
  ONE_SLIDE_SYSTEM_PROMPT,
} from "./defaults";
import type { PromptSlot } from "./types";

/**
 * Stable string identifiers used as KV keys and as URL params. Bumping or
 * renaming an id is a breaking change for any saved customization, so prefer
 * adding new ids over renaming.
 */
export const PROMPT_SLOT_IDS = {
  clientProfile: "clientProfile.system",
  competitorsDiscovery: "competitors.discovery.system",
  competitorsValidation: "competitors.validation.system",
  deepAnalysis: "deepCompetitiveAnalysis.system",
  emergingPlayers: "emergingPlayers.system",
  marketSignals: "marketSignals.system",
  customerSegments: "customerSegments.system",
  discoveryQuestions: "discoveryQuestions.system",
  expertCalls: "expertCalls.system",
  memo: "memo.system",
  oneSlide: "oneSlideSummary.system",
} as const;

export type PromptSlotId =
  (typeof PROMPT_SLOT_IDS)[keyof typeof PROMPT_SLOT_IDS];

export const PROMPT_SLOTS: readonly PromptSlot[] = [
  {
    id: PROMPT_SLOT_IDS.clientProfile,
    agent: "clientProfile",
    label: "Client Website Understanding",
    description:
      "Drives how we read the client's website. Add lenses (e.g. 'always look for ICP signals in case studies') or change the level of detail.",
    defaultPrompt: CLIENT_PROFILE_SYSTEM_PROMPT,
  },
  {
    id: PROMPT_SLOT_IDS.competitorsDiscovery,
    agent: "competitors",
    label: "Competitor Discovery",
    description:
      "Used during the multi-region discovery passes when first drafting the competitor list.",
    defaultPrompt: COMPETITORS_DISCOVERY_SYSTEM_PROMPT,
  },
  {
    id: PROMPT_SLOT_IDS.competitorsValidation,
    agent: "competitors",
    label: "Competitor Validation",
    description:
      "Used during the deep-reasoning validation pass that filters and refines the candidate list.",
    defaultPrompt: COMPETITORS_VALIDATION_SYSTEM_PROMPT,
  },
  {
    id: PROMPT_SLOT_IDS.deepAnalysis,
    agent: "deepCompetitiveAnalysis",
    label: "Deep Competitive Analysis",
    description:
      "Steers the per-competitor teardown. Add sections you always want surfaced (e.g. partner ecosystem, integrations).",
    defaultPrompt: DEEP_ANALYSIS_SYSTEM_PROMPT,
  },
  {
    id: PROMPT_SLOT_IDS.emergingPlayers,
    agent: "emergingPlayers",
    label: "Emerging & Adjacent Players",
    description:
      "Tunes how aggressive we are about adjacent / non-obvious players. Useful if you want a strict 'venture-backed only' or 'open source first' lens.",
    defaultPrompt: EMERGING_PLAYERS_SYSTEM_PROMPT,
  },
  {
    id: PROMPT_SLOT_IDS.marketSignals,
    agent: "marketSignals",
    label: "Market Signals",
    description:
      "Controls how we surface recent funding, M&A, regulation, and other market signals.",
    defaultPrompt: MARKET_SIGNALS_SYSTEM_PROMPT,
  },
  {
    id: PROMPT_SLOT_IDS.customerSegments,
    agent: "customerSegments",
    label: "Customer Segmentation",
    description:
      "Shapes how we infer buyer personas, pains, triggers, and objections.",
    defaultPrompt: CUSTOMER_SEGMENTS_SYSTEM_PROMPT,
  },
  {
    id: PROMPT_SLOT_IDS.discoveryQuestions,
    agent: "discoveryQuestions",
    label: "Discovery Questions",
    description:
      "Steers the kind of first-call questions we draft. Add your firm's interview style here.",
    defaultPrompt: DISCOVERY_QUESTIONS_SYSTEM_PROMPT,
  },
  {
    id: PROMPT_SLOT_IDS.expertCalls,
    agent: "expertCalls",
    label: "Expert-Call Targets",
    description:
      "Adjusts the kinds of expert profiles we suggest (e.g. weight more toward channel partners or former buyers).",
    defaultPrompt: EXPERT_CALLS_SYSTEM_PROMPT,
  },
  {
    id: PROMPT_SLOT_IDS.memo,
    agent: "memo",
    label: "Research Memo",
    description:
      "Voice and structure of the streamed memo. Add tone preferences or extra sections you always want.",
    defaultPrompt: MEMO_SYSTEM_PROMPT,
  },
  {
    id: PROMPT_SLOT_IDS.oneSlide,
    agent: "oneSlideSummary",
    label: "One-Slide Summary",
    description:
      "Controls how concise / how punchy the client-ready one-slide synthesis should be.",
    defaultPrompt: ONE_SLIDE_SYSTEM_PROMPT,
  },
];

const SLOT_BY_ID = new Map<string, PromptSlot>(
  PROMPT_SLOTS.map((slot) => [slot.id, slot]),
);

export function getPromptSlot(id: string): PromptSlot | undefined {
  return SLOT_BY_ID.get(id);
}

export function isPromptSlotId(id: string): id is PromptSlotId {
  return SLOT_BY_ID.has(id);
}
