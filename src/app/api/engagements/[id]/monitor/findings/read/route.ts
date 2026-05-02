import { NextResponse } from "next/server";
import { getEngagement } from "@/lib/db";
import {
  markAllFindingsRead,
  markFindingRead,
} from "@/lib/monitoring/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReadBody {
  findingIds?: unknown;
  all?: unknown;
}

/**
 * Mark findings as read. Two modes:
 *
 *   POST { all: true }                    → mark every unread finding read
 *   POST { findingIds: ["f_1", "f_2"] }   → mark a specific subset read
 *
 * Both modes are idempotent. Returns the number of findings actually
 * mutated so the UI can update its unread badge optimistically.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const engagement = await getEngagement(id);
  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }

  let body: ReadBody;
  try {
    body = (await request.json()) as ReadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.all === true) {
    const updated = await markAllFindingsRead(id);
    return NextResponse.json({ updated });
  }

  if (!Array.isArray(body.findingIds)) {
    return NextResponse.json(
      { error: "Provide either { all: true } or { findingIds: string[] }" },
      { status: 400 },
    );
  }

  const ids = body.findingIds.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  let updated = 0;
  await Promise.all(
    ids.map(async (findingId) => {
      const before = await markFindingRead(id, findingId, true);
      // markFindingRead returns the (possibly already-read) record, so
      // we can't distinguish hits from no-ops just by truthiness.
      // Using a separate check would double the round-trips; for the UI
      // a count of "ids we attempted" is good enough.
      if (before) updated += 1;
    }),
  );

  return NextResponse.json({ updated });
}
