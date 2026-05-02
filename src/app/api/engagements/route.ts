import { NextResponse } from "next/server";
import { createEngagement, normalizeEnabledAgents } from "@/lib/engagements";
import { listEngagements } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const engagements = await listEngagements();
  return NextResponse.json({ engagements });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      clientUrl?: string;
      projectName?: string;
      clientName?: string;
      industry?: string;
      geography?: string;
      knownCompetitors?: string[];
      notes?: string;
      enabledAgents?: string[];
    };

    if (!body?.clientUrl) {
      return NextResponse.json(
        { error: "clientUrl is required" },
        { status: 400 },
      );
    }

    const enabledAgents = Array.isArray(body.enabledAgents)
      ? normalizeEnabledAgents(
          body.enabledAgents.filter(
            (value): value is string => typeof value === "string",
          ),
        )
      : undefined;

    const engagement = await createEngagement({
      clientUrl: body.clientUrl,
      projectName: body.projectName,
      clientName: body.clientName,
      industry: body.industry,
      geography: body.geography,
      knownCompetitors: body.knownCompetitors,
      notes: body.notes,
      enabledAgents,
    });

    return NextResponse.json({ engagement }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
