import { NextResponse } from "next/server";
import { runDeepAnalysis } from "@/lib/agents/deep-analysis";
import {
  getEngagement,
  getResult,
  saveResult,
  updateAgentStatus,
} from "@/lib/db";
import { citationsToEvidence } from "@/lib/agents/base";
import { newResultId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const engagement = await getEngagement(id);
  if (!engagement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as { competitorUrls?: string[] };
  const urls = (body.competitorUrls ?? []).filter(Boolean);
  if (urls.length === 0) {
    return NextResponse.json(
      { error: "competitorUrls is required" },
      { status: 400 },
    );
  }

  await updateAgentStatus(id, "deepCompetitiveAnalysis", "running");

  try {
    const profileResult = await getResult(id, "clientProfile");
    const start = Date.now();
    const { data, citations } = await runDeepAnalysis({
      engagement,
      competitorUrls: urls,
      clientProfile: profileResult?.data,
    });
    const result = {
      id: newResultId(),
      engagementId: id,
      type: "deepCompetitiveAnalysis" as const,
      status: "complete" as const,
      data,
      citations: citationsToEvidence(citations),
      createdAt: new Date(start).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveResult(id, result);
    await updateAgentStatus(id, "deepCompetitiveAnalysis", "complete");
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    await updateAgentStatus(id, "deepCompetitiveAnalysis", "failed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
