import { NextResponse } from "next/server";
import { getEvents } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const fromIndex = Number(url.searchParams.get("from") ?? 0);
  const events = await getEvents(id, Number.isFinite(fromIndex) ? fromIndex : 0);
  return NextResponse.json({ events });
}
