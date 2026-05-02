"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Input";
import { AGENT_LABELS } from "@/lib/agents";
import { previewEffectivePrompt } from "@/lib/prompts/merge";
import type {
  PromptMergeMode,
  ResolvedPromptSlot,
} from "@/lib/prompts/types";

interface PromptSettingsProps {
  initialSlots: ResolvedPromptSlot[];
}

const MAX_TEXT_CHARS = 4000;

/**
 * How long to wait after the last edit before persisting. Short enough that
 * users see "Saved" while they're still thinking; long enough that we don't
 * fire a request on every keystroke.
 */
const AUTOSAVE_DEBOUNCE_MS = 700;

export function PromptSettings({ initialSlots }: PromptSettingsProps) {
  const [slots, setSlots] = useState<ResolvedPromptSlot[]>(initialSlots);

  const updateSlot = useCallback((next: ResolvedPromptSlot) => {
    setSlots((current) =>
      current.map((slot) => (slot.id === next.id ? next : slot)),
    );
  }, []);

  if (slots.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No customizable prompts are registered.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <PromptSlotCard key={slot.id} slot={slot} onUpdate={updateSlot} />
      ))}
    </div>
  );
}

interface PromptSlotCardProps {
  slot: ResolvedPromptSlot;
  onUpdate: (slot: ResolvedPromptSlot) => void;
}

type SaveStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

function PromptSlotCard({ slot, onUpdate }: PromptSlotCardProps) {
  const initialMode = slot.customization?.mode ?? "append";
  const initialText = slot.customization?.text ?? "";

  const [mode, setMode] = useState<PromptMergeMode>(initialMode);
  const [text, setText] = useState<string>(initialText);
  const [showDefault, setShowDefault] = useState(false);
  const [showEffective, setShowEffective] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    slot.customization?.updatedAt ?? null,
  );

  // Holds the debounce timer for the in-progress auto-save. We keep it in a
  // ref so handleReset (and unmount cleanup) can cancel a pending save
  // without waiting for it to fire.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Aborts the most recent in-flight PUT so a stale response can't overwrite
  // a newer save. Only the latest controller is kept; replaced on each save.
  const abortRef = useRef<AbortController | null>(null);

  const isDirty = useMemo(() => {
    if (mode !== initialMode) return true;
    return text.trim() !== initialText.trim();
  }, [mode, text, initialMode, initialText]);

  const overLimit = text.length > MAX_TEXT_CHARS;
  const hasCustomization = Boolean(slot.customization);

  const saveNow = useCallback(
    async (snapshot: { mode: PromptMergeMode; text: string }) => {
      // Cancel any in-flight save so its response can't clobber a newer one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSaving(true);
      setSaveError(null);
      try {
        const response = await fetch("/api/settings/prompts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotId: slot.id,
            mode: snapshot.mode,
            text: snapshot.text,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Save failed (${response.status})`);
        }
        const body = (await response.json()) as { slot: ResolvedPromptSlot };
        // Intentionally do NOT call setText/setMode here — the user may have
        // typed more between when this save started and when it resolved,
        // and overwriting their input would be jarring.
        onUpdate(body.slot);
        setLastSavedAt(
          body.slot.customization?.updatedAt ?? new Date().toISOString(),
        );
      } catch (caught) {
        if ((caught as Error)?.name === "AbortError") return;
        setSaveError(
          caught instanceof Error ? caught.message : "Save failed",
        );
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsSaving(false);
      }
    },
    [onUpdate, slot.id],
  );

  // Auto-save: every edit re-arms a short debounce; if the user pauses
  // typing for AUTOSAVE_DEBOUNCE_MS, the latest snapshot is persisted.
  useEffect(() => {
    if (!isDirty || overLimit || resetting) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void saveNow({ mode, text });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [mode, text, isDirty, overLimit, resetting, saveNow]);

  // Unmount cleanup: abort any in-flight save so we don't try to setState on
  // an unmounted component, and drop any pending debounce.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const handleReset = useCallback(async () => {
    setResetting(true);
    setSaveError(null);
    // Cancel any pending or in-flight save before issuing the DELETE so a
    // late save can't immediately re-create the customization we just cleared.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    try {
      const response = await fetch("/api/settings/prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Reset failed (${response.status})`);
      }
      const body = (await response.json()) as { slot: ResolvedPromptSlot };
      onUpdate(body.slot);
      setText("");
      setMode("append");
      setLastSavedAt(null);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }, [onUpdate, slot.id]);

  const status: SaveStatus = useMemo(() => {
    if (isSaving) return { kind: "saving" };
    if (saveError) return { kind: "error", message: saveError };
    if (isDirty && !overLimit) return { kind: "pending" };
    if (lastSavedAt) return { kind: "saved", at: lastSavedAt };
    return { kind: "idle" };
  }, [isSaving, saveError, isDirty, overLimit, lastSavedAt]);

  return (
    <Card>
      <CardBody className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight">
                {slot.label}
              </h2>
              <Badge tone="muted">{AGENT_LABELS[slot.agent]}</Badge>
              {hasCustomization && (
                <Badge tone="info">customized</Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              {slot.description}
            </p>
          </div>
        </header>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-[var(--muted)]">
            How should we use your text?
          </legend>
          <div className="flex flex-wrap gap-2">
            <ModeOption
              checked={mode === "append"}
              label="Add on top of our default"
              hint="Recommended. We keep our prompt and append your guidance after it."
              onSelect={() => setMode("append")}
              name={`${slot.id}-mode`}
            />
            <ModeOption
              checked={mode === "replace"}
              label="Replace our default entirely"
              hint="Power-user. Your text becomes the full system prompt."
              onSelect={() => setMode("replace")}
              name={`${slot.id}-mode`}
            />
          </div>
        </fieldset>

        <Textarea
          label="Your customization"
          hint={
            mode === "append"
              ? "Tip: include your firm's voice, additional sections you always want, or red lines to never cross. Changes save automatically."
              : "Heads up: replacing our prompt removes safeguards we've tuned. Make sure you replicate any constraints you want preserved. Changes save automatically."
          }
          rows={5}
          value={text}
          maxLength={MAX_TEXT_CHARS}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            mode === "append"
              ? "e.g. Always lead with the financial implications. Highlight any pricing data you find. Use British English."
              : "e.g. You are a McKinsey-style analyst..."
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-[var(--muted)]">
            <span>
              {text.length}/{MAX_TEXT_CHARS} chars
              {overLimit && (
                <span className="ml-2 text-[var(--danger)]">over limit</span>
              )}
            </span>
            <SaveStatusIndicator status={status} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setShowDefault((prev) => !prev)}
            >
              {showDefault ? "Hide" : "Show"} default prompt
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setShowEffective((prev) => !prev)}
            >
              {showEffective ? "Hide" : "Preview"} effective prompt
            </Button>
          </div>
        </div>

        {showDefault && (
          <PromptPreview
            label="Default prompt"
            body={slot.defaultPrompt}
          />
        )}

        {showEffective && (
          <PromptPreview
            label={
              mode === "replace" && text.trim().length > 0
                ? "Effective prompt (your replacement)"
                : "Effective prompt (default + your additions)"
            }
            body={previewEffectivePrompt(slot.defaultPrompt, mode, text)}
          />
        )}

        {hasCustomization && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={handleReset}
              loading={resetting}
              disabled={isSaving}
            >
              Reset to default
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

interface ModeOptionProps {
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
  name: string;
}

function ModeOption({ checked, onSelect, label, hint, name }: ModeOptionProps) {
  return (
    <label
      className={`flex max-w-[280px] flex-1 cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
        checked
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 accent-[var(--accent)]"
      />
      <span className="block">
        <span className="block font-medium text-[var(--foreground)]">
          {label}
        </span>
        <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
          {hint}
        </span>
      </span>
    </label>
  );
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  switch (status.kind) {
    case "saving":
      return (
        <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
          <Spinner />
          Saving…
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)]" />
          Edits pending…
        </span>
      );
    case "saved":
      return (
        <span className="inline-flex items-center gap-1.5 text-[var(--success)]">
          <CheckIcon />
          Saved {formatTimestamp(status.at)}
        </span>
      );
    case "error":
      return (
        <span
          className="inline-flex items-center gap-1.5 text-[var(--danger)]"
          title={status.message}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
          Couldn&rsquo;t save — keep editing to retry
        </span>
      );
    case "idle":
    default:
      return null;
  }
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-r-transparent"
    />
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

interface PromptPreviewProps {
  label: string;
  body: string;
}

function PromptPreview({ label, body }: PromptPreviewProps) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-alt)]">
      <div className="border-b border-[var(--border)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--foreground)]">
        {body}
      </pre>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString();
}
