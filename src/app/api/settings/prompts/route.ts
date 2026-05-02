import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearPromptCustomization,
  isPromptSlotId,
  listResolvedPromptSlots,
  resolvedSlotFromCustomization,
  setPromptCustomization,
} from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cap free-form text well below Exa's accepted prompt size while still leaving
 * the user room for several paragraphs of detailed guidance. We trim before
 * validating so leading/trailing whitespace doesn't eat into the budget.
 */
const MAX_PROMPT_TEXT_CHARS = 4000;

const PutBody = z
  .object({
    slotId: z.string().min(1).max(200),
    mode: z.enum(["append", "replace"]),
    text: z.string().max(MAX_PROMPT_TEXT_CHARS),
  })
  .strict();

const DeleteBody = z
  .object({
    slotId: z.string().min(1).max(200),
  })
  .strict();

export async function GET() {
  const slots = await listResolvedPromptSlots();
  return NextResponse.json({ slots });
}

export async function PUT(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PutBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { slotId, mode, text } = parsed.data;
  if (!isPromptSlotId(slotId)) {
    return NextResponse.json(
      { error: `Unknown prompt slot id: ${slotId}` },
      { status: 404 },
    );
  }

  try {
    const customization = await setPromptCustomization(slotId, { mode, text });
    // The slot may now have an empty text (which we treat as "cleared"). Reload
    // the resolved slot so the client always sees the truth-in-store value.
    const slot = resolvedSlotFromCustomization(
      slotId,
      text.trim().length === 0 ? null : customization,
    );
    return NextResponse.json({ slot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = DeleteBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { slotId } = parsed.data;
  if (!isPromptSlotId(slotId)) {
    return NextResponse.json(
      { error: `Unknown prompt slot id: ${slotId}` },
      { status: 404 },
    );
  }

  try {
    await clearPromptCustomization(slotId);
    const slot = resolvedSlotFromCustomization(slotId, null);
    return NextResponse.json({ slot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
