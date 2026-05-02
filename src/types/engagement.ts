import type { CustomTab } from "./customTab";

export type AgentType =
  | "clientProfile"
  | "competitors"
  | "deepCompetitiveAnalysis"
  | "emergingPlayers"
  | "marketSignals"
  | "customerSegments"
  | "discoveryQuestions"
  | "expertCalls"
  | "memo"
  | "oneSlideSummary";

export type AgentStatus = "pending" | "running" | "complete" | "failed";

export type EngagementStatus =
  | "created"
  | "researching"
  | "complete"
  | "failed";

export interface Engagement {
  id: string;
  projectName?: string;
  clientUrl: string;
  clientName?: string;
  industry?: string;
  geography?: string;
  knownCompetitors?: string[];
  notes?: string;
  status: EngagementStatus;
  createdAt: string;
  updatedAt: string;
  agents: Record<AgentType, AgentStatus>;
  /**
   * Agent-backed tabs the user has chosen to enable for this engagement.
   * Order is preserved for tab display. When omitted (legacy engagements),
   * callers must treat all agents as enabled — see `getEnabledAgents`.
   */
  enabledAgents?: AgentType[];
  /**
   * User-authored research tabs. Each carries its own prompt that's run
   * by a generic Exa agent. Order is preserved for tab display.
   */
  customTabs?: CustomTab[];
}

export interface AgentEvent {
  engagementId: string;
  agent: AgentType | "orchestrator";
  type:
    | "agent_started"
    | "agent_progress"
    | "agent_completed"
    | "agent_failed"
    | "pipeline_started"
    | "pipeline_completed"
    | "pipeline_failed"
    | "log";
  message?: string;
  timestamp: string;
  data?: unknown;
}
