import { NextResponse } from "next/server";
import { deleteCustomTab, getCustomTabResult } from "@/lib/customTabs";
import { getEngagement } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; tabId: string }> },
) {
  const { id, tabId } = await context.params;
  const engagement = await getEngagement(id);
  if (!engagement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const tab = (engagement.customTabs ?? []).find((t) => t.id === tabId);
  if (!tab) {
    return NextResponse.json({ error: "Custom tab not found" }, { status: 404 });
  }
  const result = await getCustomTabResult(id, tabId);
  return NextResponse.json({ tab, result });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; tabId: string }> },
) {
  const { id, tabId } = await context.params;
  const engagement = await deleteCustomTab(id, tabId);
  if (!engagement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ engagement });
}
