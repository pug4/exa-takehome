import type {
  AgentEvent,
  AgentType,
  EngagementStatus,
} from "@/types/engagement";
import type { AgentDataMap } from "@/types/research";
import {
  appendEvent,
  getAllResults,
  getEngagement,
  getResult,
  updateEngagementStatus,
} from "../db";
import { getEnabledAgents } from "../engagements";
import {
  syncMonitorWithCompetitors,
  syncMonitorWithEmergingPlayers,
} from "../monitoring/lifecycle";
import { AGENT_REGISTRY } from "./index";
import { runAgent, type AgentContext, type AgentDefinition } from "./base";
import { runCustomTab } from "./custom-tab";
import { buildResearchContext } from "./context";

interface OrchestratorOptions {
  emit?: (event: AgentEvent) => void;
}

export async function runPipeline(
  engagementId: string,
  options: OrchestratorOptions = {},
): Promise<void> {
  const engagement = await getEngagement(engagementId);
  if (!engagement) throw new Error(`Engagement ${engagementId} not found`);

  await updateEngagementStatus(engagementId, "researching");

  const ctx: AgentContext = {
    engagement,
    results: await loadCompletedResults(engagementId),
    emit: makeEmitter(engagementId, options.emit),
  };

  const enabled = new Set<AgentType>(getEnabledAgents(engagement));

  const runIfEnabled = async <T extends AgentType>(
    agent: AgentDefinition<T>,
  ): Promise<void> => {
    if (!enabled.has(agent.type)) return;
    await runAgent(agent, ctx);
  };

  const runManyIfEnabled = async (
    agents: ReadonlyArray<AgentDefinition<AgentType>>,
  ): Promise<void> => {
    const filtered = agents.filter((agent) => enabled.has(agent.type));
    await Promise.all(filtered.map((agent) => runAgent(agent, ctx)));
  };

  const customTabCount = engagement.customTabs?.length ?? 0;
  const totalSteps = enabled.size + customTabCount;
  await ctx.emit({
    agent: "orchestrator",
    type: "pipeline_started",
    message:
      totalSteps === 0
        ? "Pipeline started with no enabled tabs — nothing to do"
        : `Starting research pipeline (${enabled.size} built-in agent${enabled.size === 1 ? "" : "s"}, ${customTabCount} custom tab${customTabCount === 1 ? "" : "s"})`,
  });

  try {
    await runIfEnabled(AGENT_REGISTRY.clientProfile);

    await runManyIfEnabled([
      AGENT_REGISTRY.competitors,
      AGENT_REGISTRY.emergingPlayers,
      AGENT_REGISTRY.marketSignals,
      AGENT_REGISTRY.customerSegments,
    ]);

    // Roll any newly-discovered direct competitors and emerging players
    // into the engagement's monitor so the next tick crawls them too.
    // We do this here (rather than inside the agents) so the
    // orchestrator owns cross-agent side effects in one place.
    if (enabled.has("competitors") || enabled.has("emergingPlayers")) {
      await syncMonitorAfterDiscovery(engagementId, ctx, {
        includeCompetitors: enabled.has("competitors"),
        includeEmergingPlayers: enabled.has("emergingPlayers"),
      });
    }

    await runIfEnabled(AGENT_REGISTRY.deepCompetitiveAnalysis);

    await runManyIfEnabled([
      AGENT_REGISTRY.discoveryQuestions,
      AGENT_REGISTRY.expertCalls,
    ]);

    await runIfEnabled(AGENT_REGISTRY.memo);
    await runIfEnabled(AGENT_REGISTRY.oneSlideSummary);

    // Run user-authored custom tabs last and in parallel — they don't
    // block any built-in stage and they typically depend on the same
    // research context that's now fully populated. We pass the latest
    // engagement (re-read from the store so we pick up tabs added
    // mid-run) and a single shared context block.
    await runCustomTabs(engagementId, ctx);

    await finalizeEngagement(engagementId);
    await ctx.emit({
      agent: "orchestrator",
      type: "pipeline_completed",
      message: "Pipeline complete",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateEngagementStatus(engagementId, "failed");
    await ctx.emit({
      agent: "orchestrator",
      type: "pipeline_failed",
      message: `Pipeline failed: ${message}`,
    });
    throw error;
  }
}

interface SyncMonitorOptions {
  includeCompetitors: boolean;
  includeEmergingPlayers: boolean;
}

async function syncMonitorAfterDiscovery(
  engagementId: string,
  ctx: AgentContext,
  options: SyncMonitorOptions,
): Promise<void> {
  try {
    let competitorsAdded = 0;
    let emergingAdded = 0;

    if (options.includeCompetitors) {
      const result = await getResult(engagementId, "competitors");
      if (result?.status === "complete") {
        competitorsAdded = await syncMonitorWithCompetitors(
          engagementId,
          result,
        );
      }
    }

    if (options.includeEmergingPlayers) {
      const result = await getResult(engagementId, "emergingPlayers");
      if (result?.status === "complete") {
        // Run after the competitors sync so head-on competitors win the
        // domain-dedupe tie-break and keep their `competitor` kind.
        emergingAdded = await syncMonitorWithEmergingPlayers(
          engagementId,
          result,
        );
      }
    }

    if (competitorsAdded > 0 || emergingAdded > 0) {
      const segments: string[] = [];
      if (competitorsAdded > 0) {
        segments.push(
          `${competitorsAdded} competitor${competitorsAdded === 1 ? "" : "s"}`,
        );
      }
      if (emergingAdded > 0) {
        segments.push(
          `${emergingAdded} emerging player${emergingAdded === 1 ? "" : "s"}`,
        );
      }
      await ctx.emit({
        agent: "orchestrator",
        type: "log",
        message: `Added ${segments.join(" and ")} to monitoring.`,
      });
    }
  } catch (error) {
    // Non-fatal — log and continue with the rest of the pipeline.
    console.error(
      `[orchestrator] monitor sync failed for ${engagementId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

async function runCustomTabs(
  engagementId: string,
  ctx: AgentContext,
): Promise<void> {
  // Re-read the engagement so we pick up any custom tabs the user added
  // while the main pipeline was running.
  const fresh = await getEngagement(engagementId);
  const tabs = fresh?.customTabs ?? [];
  if (tabs.length === 0) return;

  const contextBlock = buildResearchContext(ctx);
  await Promise.all(
    tabs.map((tab) =>
      runCustomTab({
        engagement: fresh!,
        tab,
        emit: ctx.emit,
        contextBlock,
      }),
    ),
  );
}

async function loadCompletedResults(
  engagementId: string,
): Promise<AgentContext["results"]> {
  const existing = await getAllResults(engagementId);
  const results: AgentContext["results"] = {};
  for (const [type, result] of Object.entries(existing) as [
    AgentType,
    { status: string; data?: unknown },
  ][]) {
    if (result?.status === "complete" && result.data !== undefined) {
      (results as Record<AgentType, AgentDataMap[AgentType]>)[type] =
        result.data as AgentDataMap[AgentType];
    }
  }
  return results;
}

function makeEmitter(
  engagementId: string,
  forward?: (event: AgentEvent) => void,
): AgentContext["emit"] {
  return async (event) => {
    const fullEvent: AgentEvent = {
      ...event,
      engagementId,
      timestamp: new Date().toISOString(),
    };
    await appendEvent(fullEvent);
    forward?.(fullEvent);
  };
}

async function finalizeEngagement(engagementId: string): Promise<void> {
  const final = await getEngagement(engagementId);
  if (!final) return;

  const enabled = getEnabledAgents(final);
  const customTabs = final.customTabs ?? [];

  // If nothing was enabled at all, the pipeline succeeded vacuously.
  if (enabled.length === 0 && customTabs.length === 0) {
    await updateEngagementStatus(engagementId, "complete");
    return;
  }

  const statuses = [
    ...enabled.map((agent) => final.agents[agent]),
    ...customTabs.map((tab) => tab.status),
  ];
  const allTerminal = statuses.every(
    (status) => status === "complete" || status === "failed",
  );
  if (!allTerminal) return;

  const anyComplete = statuses.some((status) => status === "complete");
  const nextStatus: EngagementStatus = anyComplete ? "complete" : "failed";
  await updateEngagementStatus(engagementId, nextStatus);
}
