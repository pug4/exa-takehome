import type { AgentType } from "@/types/engagement";
import { clientProfileAgent } from "./client-profile";
import { competitorsAgent } from "./competitors";
import { customerSegmentsAgent } from "./customer-segments";
import { deepAnalysisAgent } from "./deep-analysis";
import { discoveryQuestionsAgent } from "./discovery-questions";
import { emergingPlayersAgent } from "./emerging-players";
import { expertCallsAgent } from "./expert-calls";
import { marketSignalsAgent } from "./market-signals";
import { memoAgent } from "./memo";
import { oneSlideAgent } from "./one-slide";
import type { AgentDefinition } from "./base";

export const AGENT_REGISTRY = {
  clientProfile: clientProfileAgent,
  competitors: competitorsAgent,
  deepCompetitiveAnalysis: deepAnalysisAgent,
  emergingPlayers: emergingPlayersAgent,
  marketSignals: marketSignalsAgent,
  customerSegments: customerSegmentsAgent,
  discoveryQuestions: discoveryQuestionsAgent,
  expertCalls: expertCallsAgent,
  memo: memoAgent,
  oneSlideSummary: oneSlideAgent,
} as const satisfies Record<AgentType, AgentDefinition<AgentType>>;

export const AGENT_LABELS: Record<AgentType, string> = {
  clientProfile: "Client Profile",
  competitors: "Competitors",
  deepCompetitiveAnalysis: "Deep Analysis",
  emergingPlayers: "Emerging Players",
  marketSignals: "Market Signals",
  customerSegments: "Customer Segments",
  discoveryQuestions: "Discovery Questions",
  expertCalls: "Expert Calls",
  memo: "Memo",
  oneSlideSummary: "One-Slide",
};

export const AGENT_ORDER: AgentType[] = [
  "clientProfile",
  "competitors",
  "deepCompetitiveAnalysis",
  "emergingPlayers",
  "marketSignals",
  "customerSegments",
  "discoveryQuestions",
  "expertCalls",
  "memo",
  "oneSlideSummary",
];

export type { AgentDefinition } from "./base";
