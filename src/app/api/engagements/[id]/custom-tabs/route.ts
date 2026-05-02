import { NextResponse } from "next/server";
import {
  CUSTOM_TAB_LABEL_MAX,
  CUSTOM_TAB_PROMPT_MAX,
  CustomTabValidationError,
  createCustomTab,
} from "@/lib/customTabs";
import { getEngagement } from "@/lib/db";

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
  return NextResponse.json({ customTabs: engagement.customTabs ?? [] });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: { label?: unknown; prompt?: unknown };
  try {
    body = (await request.json()) as { label?: unknown; prompt?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.label !== "string" || typeof body.prompt !== "string") {
    return NextResponse.json(
      {
        error: `Body must be { label: string (≤${CUSTOM_TAB_LABEL_MAX}), prompt: string (≤${CUSTOM_TAB_PROMPT_MAX}) }`,
      },
      { status: 400 },
    );
  }

  try {
    const { engagement, tab } = await createCustomTab(id, {
      label: body.label,
      prompt: body.prompt,
    });
    return NextResponse.json({ engagement, tab }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomTabValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof Error &&
      error.message.includes("not found")
    ) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
