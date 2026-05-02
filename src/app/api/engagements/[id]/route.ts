import { NextResponse } from "next/server";
import {
  deleteEngagement,
  getAllResults,
  getEngagement,
  updateEnabledAgents,
} from "@/lib/db";
import { getAllCustomTabResults } from "@/lib/customTabs";
import { normalizeEnabledAgents } from "@/lib/engagements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const engagement = await getEngagement(id);
  if (!engagement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [results, customResults] = await Promise.all([
    getAllResults(id),
    getAllCustomTabResults(engagement),
  ]);
  return NextResponse.json({ engagement, results, customResults });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: { enabledAgents?: unknown };
  try {
    body = (await request.json()) as { enabledAgents?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.enabledAgents)) {
    return NextResponse.json(
      { error: "enabledAgents must be an array of agent types" },
      { status: 400 },
    );
  }

  const enabledAgents = normalizeEnabledAgents(
    body.enabledAgents.filter(
      (value): value is string => typeof value === "string",
    ),
  );

  const engagement = await updateEnabledAgents(id, enabledAgents);
  if (!engagement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ engagement });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  await deleteEngagement(id);
  return NextResponse.json({ ok: true });
}
