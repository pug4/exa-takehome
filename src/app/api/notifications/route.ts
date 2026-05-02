import { NextResponse } from "next/server";
import type { Engagement } from "@/types/engagement";
import type { NotificationFeedItem } from "@/types/monitoring";
import { listEngagements } from "@/lib/db";
import { listGlobalFindings } from "@/lib/monitoring/store";
import { getDomain } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Cross-engagement notifications feed for the front-page widget. Joins
 * every recent finding with its engagement so the client doesn't have to
 * make N follow-up requests to display the engagement name.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));

    const [findings, engagements] = await Promise.all([
      listGlobalFindings(limit),
      listEngagements(),
    ]);

    const engagementsById = new Map(engagements.map((e) => [e.id, e]));
    const items: NotificationFeedItem[] = [];
    let unreadCount = 0;

    for (const { engagementId, finding } of findings) {
      const engagement = engagementsById.get(engagementId);
      if (!engagement) continue; // engagement was deleted; skip orphan
      if (!finding.read) unreadCount += 1;
      items.push({
        finding,
        engagement: {
          id: engagement.id,
          name: displayName(engagement),
          clientUrl: engagement.clientUrl,
        },
      });
    }

    return NextResponse.json({
      items,
      unreadCount,
      total: items.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load notifications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseLimit(raw: string | null): number {
  const parsed = Number(raw ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(parsed));
}

function displayName(engagement: Engagement): string {
  return (
    engagement.projectName?.trim() ||
    engagement.clientName?.trim() ||
    getDomain(engagement.clientUrl)
  );
}
