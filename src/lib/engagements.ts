import type { AgentType, Engagement } from "@/types/engagement";
import { AGENT_ORDER } from "./agents";
import { saveEngagement } from "./db";
import { newEngagementId } from "./ids";
import { createMonitorForEngagement } from "./monitoring/lifecycle";
import { inferCompanyNameFromUrl, normalizeUrl } from "./url";

export interface CreateEngagementInput {
  clientUrl: string;
  projectName?: string;
  clientName?: string;
  industry?: string;
  geography?: string;
  knownCompetitors?: string[];
  notes?: string;
  enabledAgents?: AgentType[];
}

export function createDefaultAgentStatuses(): Engagement["agents"] {
  return {
    clientProfile: "pending",
    competitors: "pending",
    deepCompetitiveAnalysis: "pending",
    emergingPlayers: "pending",
    marketSignals: "pending",
    customerSegments: "pending",
    discoveryQuestions: "pending",
    expertCalls: "pending",
    memo: "pending",
    oneSlideSummary: "pending",
  } satisfies Record<AgentType, Engagement["agents"][AgentType]>;
}

const ALL_AGENTS_SET: ReadonlySet<AgentType> = new Set(AGENT_ORDER);

/**
 * Sanitize an arbitrary list of agent identifiers down to known agent types
 * in the canonical {@link AGENT_ORDER} order, with duplicates removed. Used
 * when accepting `enabledAgents` from API input.
 */
export function normalizeEnabledAgents(
  input: readonly string[] | undefined,
): AgentType[] {
  if (!input) return [...AGENT_ORDER];
  const requested = new Set(
    input.filter((value): value is AgentType =>
      ALL_AGENTS_SET.has(value as AgentType),
    ),
  );
  return AGENT_ORDER.filter((agent) => requested.has(agent));
}

/**
 * Return the agents currently enabled on an engagement, preserving the
 * canonical ordering. Engagements created before this field existed are
 * treated as "all agents enabled" so they keep working unchanged.
 */
export function getEnabledAgents(engagement: Engagement): AgentType[] {
  if (!engagement.enabledAgents || engagement.enabledAgents.length === 0) {
    return [...AGENT_ORDER];
  }
  const enabled = new Set(engagement.enabledAgents);
  return AGENT_ORDER.filter((agent) => enabled.has(agent));
}

export async function createEngagement(
  input: CreateEngagementInput,
): Promise<Engagement> {
  const url = normalizeUrl(input.clientUrl);
  if (!url) throw new Error("Client URL is required");

  const id = newEngagementId();
  const now = new Date().toISOString();
  const enabledAgents = normalizeEnabledAgents(input.enabledAgents);
  const engagement: Engagement = {
    id,
    clientUrl: url,
    projectName: input.projectName?.trim() || undefined,
    clientName: input.clientName?.trim() || inferCompanyNameFromUrl(url),
    industry: input.industry?.trim() || undefined,
    geography: input.geography?.trim() || undefined,
    knownCompetitors: input.knownCompetitors
      ?.map((u) => normalizeUrl(u))
      .filter(Boolean),
    notes: input.notes?.trim() || undefined,
    status: "created",
    createdAt: now,
    updatedAt: now,
    agents: createDefaultAgentStatuses(),
    enabledAgents,
  };
  await saveEngagement(engagement);

  // Spin up a default monitor so this engagement is "watched" from the
  // moment it is created — the user can edit sources or pause it from
  // the Monitoring tab. Failures here are non-fatal: an engagement
  // without a monitor is still usable, just not auto-tracked.
  try {
    await createMonitorForEngagement(engagement);
  } catch (error) {
    console.error(
      `[engagements] failed to create monitor for ${engagement.id}:`,
      error instanceof Error ? error.message : error,
    );
  }

  return engagement;
}
