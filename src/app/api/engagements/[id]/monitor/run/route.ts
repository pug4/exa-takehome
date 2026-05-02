import { NextResponse } from "next/server";
import { getEngagement } from "@/lib/db";
import { runMonitor } from "@/lib/monitoring/crawler";
import { createMonitorForEngagement } from "@/lib/monitoring/lifecycle";
import { getMonitor } from "@/lib/monitoring/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * "Run now" — kick off an immediate crawl regardless of cadence. Used by
 * the Monitoring tab and useful while debugging the crawler. Returns the
 * run summary plus the freshly-discovered findings so the UI can update
 * without waiting for a follow-up GET.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const engagement = await getEngagement(id);
  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }

  const monitor =
    (await getMonitor(id)) ?? (await createMonitorForEngagement(engagement));

  if (monitor.sources.length === 0) {
    return NextResponse.json(
      { error: "Add at least one source before running the monitor" },
      { status: 400 },
    );
  }

  try {
    const { summary, newFindings } = await runMonitor(monitor, { force: true });
    return NextResponse.json({ summary, newFindings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Run failed";
    console.error(`[monitor.run] engagement ${id}:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
