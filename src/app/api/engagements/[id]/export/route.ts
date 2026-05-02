import { NextResponse } from "next/server";
import type { AgentType } from "@/types/engagement";
import { getAllResults, getEngagement } from "@/lib/db";
import { CSV_EXPORTS } from "@/lib/exports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CSV_AGENT_TYPES = new Set<AgentType>([
  "competitors",
  "emergingPlayers",
  "marketSignals",
  "customerSegments",
  "expertCalls",
  "discoveryQuestions",
]);

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "memo";
  const engagement = await getEngagement(id);
  if (!engagement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const results = await getAllResults(id);

  if (format === "memo") {
    const memo = results.memo?.data?.markdown ?? "# Memo not yet generated";
    return new Response(memo, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="memo-${engagement.clientName ?? engagement.id}.md"`,
      },
    });
  }

  if (format === "one-slide") {
    const slide = results.oneSlideSummary?.data?.markdown ?? "# Slide not generated";
    return new Response(slide, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="one-slide-${engagement.clientName ?? engagement.id}.md"`,
      },
    });
  }

  if (CSV_AGENT_TYPES.has(format as AgentType)) {
    const agentType = format as AgentType;
    const result = results[agentType];
    if (!result) {
      return NextResponse.json(
        { error: "Result not yet generated" },
        { status: 404 },
      );
    }
    const csv = CSV_EXPORTS[agentType]?.(result) ?? "";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${agentType}-${engagement.clientName ?? engagement.id}.csv"`,
      },
    });
  }

  return NextResponse.json({ error: "Unknown format" }, { status: 400 });
}
