"use client";

import { useState } from "react";
import type { Engagement } from "@/types/engagement";
import type { CustomTab } from "@/types/customTab";
import {
  CUSTOM_TAB_LABEL_MAX,
  CUSTOM_TAB_PROMPT_MAX,
} from "@/lib/customTabs";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

interface CustomTabModalProps {
  open: boolean;
  engagementId: string;
  onClose: () => void;
  onCreated: (engagement: Engagement, tab: CustomTab) => void;
}

const FORM_ID = "new-custom-tab-form";

const PROMPT_PLACEHOLDER =
  "e.g. Find the most influential creators, journalists, and analysts who " +
  "shape the conversation in this company's industry. For each, include " +
  "what they cover, why they're influential, and where to find them.";

export function CustomTabModal({
  open,
  engagementId,
  onClose,
  onCreated,
}: CustomTabModalProps) {
  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setLabel("");
    setPrompt("");
    setError(null);
    setSubmitting(false);
  };

  // The Modal primitive forwards Esc and backdrop closes through this same
  // handler, so resetting here covers every close path (Cancel button, Esc,
  // backdrop click) without an effect.
  const handleClose = (): void => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/engagements/${engagementId}/custom-tabs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, prompt }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          payload.error ?? `Request failed: ${response.status}`,
        );
      }
      const json = (await response.json()) as {
        engagement: Engagement;
        tab: CustomTab;
      };
      reset();
      onCreated(json.engagement, json.tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add tab");
    } finally {
      setSubmitting(false);
    }
  };

  const labelTooLong = label.length > CUSTOM_TAB_LABEL_MAX;
  const promptTooLong = prompt.length > CUSTOM_TAB_PROMPT_MAX;
  const canSubmit =
    !submitting &&
    label.trim().length > 0 &&
    prompt.trim().length > 0 &&
    !labelTooLong &&
    !promptTooLong;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="lg"
      title="Add a custom tab"
      description="Give the tab a name and a research prompt. An Exa-powered agent will answer the prompt with web evidence whenever you run the pipeline."
      footer={
        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            loading={submitting}
            disabled={!canSubmit}
          >
            Add tab
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={handleSubmit}>
        <Input
          label="Tab name"
          required
          autoFocus
          placeholder="Influencers"
          value={label}
          maxLength={CUSTOM_TAB_LABEL_MAX + 10}
          onChange={(event) => setLabel(event.target.value)}
          hint={`${label.length}/${CUSTOM_TAB_LABEL_MAX}`}
        />
        <Textarea
          label="Research prompt"
          required
          rows={8}
          placeholder={PROMPT_PLACEHOLDER}
          value={prompt}
          maxLength={CUSTOM_TAB_PROMPT_MAX + 100}
          onChange={(event) => setPrompt(event.target.value)}
          hint={`${prompt.length}/${CUSTOM_TAB_PROMPT_MAX} · The agent has access to the engagement context (client URL, industry, geography, and any prior agent results).`}
          className="min-h-[160px]"
        />

        {(labelTooLong || promptTooLong) && (
          <p className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
            {labelTooLong &&
              `Tab name must be ${CUSTOM_TAB_LABEL_MAX} characters or fewer. `}
            {promptTooLong &&
              `Prompt must be ${CUSTOM_TAB_PROMPT_MAX} characters or fewer.`}
          </p>
        )}

        {error && (
          <p className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
