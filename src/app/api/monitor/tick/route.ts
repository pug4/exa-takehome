import { NextResponse } from "next/server";
import { runDueMonitors } from "@/lib/monitoring/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each tick runs at most a few monitors (each capped at ~10s of Exa
// latency), but we leave generous headroom for Vercel's serverless cap.
export const maxDuration = 120;

/**
 * Drive the continuous-monitoring scheduler.
 *
 * Designed to be called by:
 *   - a Vercel Cron job (e.g. every 5 minutes in production)
 *   - the in-app TickBeacon while a user has the site open
 *   - manually for debugging
 *
 * Idempotent: monitors not yet due are left untouched, so calling this
 * more often than the cadence just no-ops cheaply.
 */
async function handleTick(): Promise<Response> {
  try {
    const result = await runDueMonitors();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tick failed";
    console.error("[monitor.tick] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(): Promise<Response> {
  return handleTick();
}

// GET so a Vercel Cron entry (which uses GET) can drive the same handler.
export async function GET(): Promise<Response> {
  return handleTick();
}
