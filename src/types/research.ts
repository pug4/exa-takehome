import type { AgentStatus, AgentType } from "./engagement";

export interface EvidenceLink {
  url: string;
  title?: string;
  publishedDate?: string | null;
}

export interface ClientProfile {
  companyName: string;
  websiteUrl: string;
  category: string;
  positioningSummary: string;
  productsOrServices: string[];
  targetCustomers: string[];
  claims: string[];
  evidenceUrls: string[];
  confidenceLevel: "low" | "medium" | "high";
  assumptions: string[];
}

export interface Competitor {
  name: string;
  websiteUrl: string;
  competitorType: "direct" | "partial" | "low_confidence";
  shortDescription: string;
  whyTheyCompete: string;
  overlappingCustomerSegments: string[];
  evidenceUrls: string[];
  confidenceLevel: "low" | "medium" | "high";
}

export interface CompetitorList {
  competitors: Competitor[];
}

export interface CompetitorDeepAnalysis {
  name: string;
  url: string;
  positioning: string;
  productOrServiceOffering: string[];
  differentiators: string[];
  pricingSignals?: string;
  weaknessesOrGaps?: string[];
  evidenceUrls: string[];
}

export interface DeepAnalysisResult {
  competitorProfiles: CompetitorDeepAnalysis[];
  summary: string;
}

export interface EmergingPlayer {
  name: string;
  websiteUrl: string;
  category:
    | "emerging_direct_threat"
    | "adjacent_player"
    | "substitute"
    | "ecosystem_partner";
  whyRelevant: string;
  relationshipToClient: string;
  threatLevel: "low" | "medium" | "high";
  evidenceUrls: string[];
  confidenceLevel: "low" | "medium" | "high";
}

export interface EmergingPlayersResult {
  emergingPlayers: EmergingPlayer[];
}

export type MarketSignalType =
  | "demand_trend"
  | "funding"
  | "ma"
  | "regulation"
  | "product_launch"
  | "hiring"
  | "pricing_change"
  | "partnership"
  | "tech_shift"
  | "macro";

export interface MarketSignal {
  signal: string;
  signalType: MarketSignalType;
  whyItMatters: string;
  affectedPlayers: string[];
  implicationForClient: string;
  date?: string | null;
  evidenceUrls: string[];
  confidenceLevel: "low" | "medium" | "high";
}

export interface MarketSignalsResult {
  marketSignals: MarketSignal[];
}

export interface CustomerSegment {
  segment: string;
  buyerType: string;
  likelyPainPoints: string[];
  buyingTriggers: string[];
  objections: string[];
  verticals: string[];
}

export interface CustomerSegmentsResult {
  customerSegments: CustomerSegment[];
  buyerPersonas: string[];
  openQuestions: string[];
  assumptions: string[];
}

export interface DiscoveryQuestion {
  question: string;
  theme: string;
  whyItMatters: string;
  whoToAsk: string;
}

export interface DiscoveryQuestionsResult {
  recommendedQuestions: DiscoveryQuestion[];
}

export interface ExpertCallTarget {
  targetProfile: string;
  whyUseful: string;
  idealBackground: string;
  sampleQuestions: string[];
  priority: "low" | "medium" | "high";
}

export interface ExpertCallsResult {
  expertCallTargets: ExpertCallTarget[];
}

export interface MemoResult {
  markdown: string;
}

export interface OneSlideSummaryResult {
  markdown: string;
  title: string;
  clientPositioning: string;
  competitiveLandscape: string[];
  emergingPlayers: string[];
  marketSignals: string[];
  strategicQuestions: string[];
  recommendedNextSteps: string[];
}

export type AgentDataMap = {
  clientProfile: ClientProfile;
  competitors: CompetitorList;
  deepCompetitiveAnalysis: DeepAnalysisResult;
  emergingPlayers: EmergingPlayersResult;
  marketSignals: MarketSignalsResult;
  customerSegments: CustomerSegmentsResult;
  discoveryQuestions: DiscoveryQuestionsResult;
  expertCalls: ExpertCallsResult;
  memo: MemoResult;
  oneSlideSummary: OneSlideSummaryResult;
};

export interface ResearchResult<T extends AgentType = AgentType> {
  id: string;
  engagementId: string;
  type: T;
  status: AgentStatus;
  data?: AgentDataMap[T];
  error?: string;
  citations?: EvidenceLink[];
  createdAt: string;
  updatedAt: string;
}
