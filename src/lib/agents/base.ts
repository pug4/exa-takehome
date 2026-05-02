import type { AgentEvent, AgentType, Engagement } from "@/types/engagement";
import type {
  AgentDataMap,
  EvidenceLink,
  ResearchResult,
} from "@/types/research";
import {
  appendEvent,
  saveResult,
  updateAgentStatus,
} from "../db";
import type { ExaCitation } from "../exa";
import { newResultId } from "../ids";

export interface AgentContext {
  engagement: Engagement;
  results: Partial<{ [K in AgentType]: AgentDataMap[K] }>;
  emit: (event: Omit<AgentEvent, "engagementId" | "timestamp">) => Promise<void>;
}

export interface AgentDefinition<T extends AgentType> {
  type: T;
  label: string;
  description: string;
  run: (
    ctx: AgentContext,
  ) => Promise<{
    data: AgentDataMap[T];
    citations: ExaCitation[];
  }>;
}

export function citationsToEvidence(
  citations: ExaCitation[],
): EvidenceLink[] {
  return citations
    .filter((c) => Boolean(c?.url))
    .map((c) => ({
      url: c.url,
      title: c.title,
      publishedDate: c.publishedDate ?? null,
    }));
}

export function makeEmitter(engagementId: string) {
  return async (event: Omit<AgentEvent, "engagementId" | "timestamp">) => {
    const fullEvent: AgentEvent = {
      ...event,
      engagementId,
      timestamp: new Date().toISOString(),
    };
    await appendEvent(fullEvent);
  };
}

export async function runAgent<T extends AgentType>(
  agent: AgentDefinition<T>,
  ctx: AgentContext,
): Promise<ResearchResult<T> | null> {
  const start = Date.now();
  await updateAgentStatus(ctx.engagement.id, agent.type, "running");
  await ctx.emit({
    agent: agent.type,
    type: "agent_started",
    message: `${agent.label} started`,
  });

  try {
    const { data, citations } = await agent.run(ctx);
    const result: ResearchResult<T> = {
      id: newResultId(),
      engagementId: ctx.engagement.id,
      type: agent.type,
      status: "complete",
      data,
      citations: citationsToEvidence(citations),
      createdAt: new Date(start).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveResult(ctx.engagement.id, result);
    await updateAgentStatus(ctx.engagement.id, agent.type, "complete");
    await ctx.emit({
      agent: agent.type,
      type: "agent_completed",
      message: `${agent.label} complete`,
      data: { citations: result.citations?.length ?? 0 },
    });
    ctx.results[agent.type] = data;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: ResearchResult<T> = {
      id: newResultId(),
      engagementId: ctx.engagement.id,
      type: agent.type,
      status: "failed",
      error: message,
      createdAt: new Date(start).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveResult(ctx.engagement.id, result);
    await updateAgentStatus(ctx.engagement.id, agent.type, "failed");
    await ctx.emit({
      agent: agent.type,
      type: "agent_failed",
      message: `${agent.label} failed: ${message}`,
    });
    return null;
  }
}
