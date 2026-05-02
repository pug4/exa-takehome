"use client";

import { useState } from "react";
import type { AgentType, Engagement } from "@/types/engagement";
import { AGENT_ORDER } from "@/lib/agents";
import { AgentTabSelector } from "@/components/AgentTabSelector";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

interface NewEngagementModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (engagement: Engagement) => void;
}

export function NewEngagementModal({
  open,
  onClose,
  onCreated,
}: NewEngagementModalProps) {
  const [clientUrl, setClientUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [industry, setIndustry] = useState("");
  const [geography, setGeography] = useState("");
  const [knownCompetitors, setKnownCompetitors] = useState("");
  const [notes, setNotes] = useState("");
  const [enabledAgents, setEnabledAgents] = useState<AgentType[]>([
    ...AGENT_ORDER,
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setClientUrl("");
    setProjectName("");
    setIndustry("");
    setGeography("");
    setKnownCompetitors("");
    setNotes("");
    setEnabledAgents([...AGENT_ORDER]);
    setError(null);
  };

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
      const response = await fetch("/api/engagements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUrl,
          projectName: projectName || undefined,
          industry: industry || undefined,
          geography: geography || undefined,
          knownCompetitors: knownCompetitors
            ? knownCompetitors
                .split(/[,\n]/)
                .map((u) => u.trim())
                .filter(Boolean)
            : undefined,
          notes: notes || undefined,
          enabledAgents,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `Request failed: ${response.status}`);
      }
      const json = (await response.json()) as { engagement: Engagement };
      reset();
      onCreated(json.engagement);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  };

  const formId = "new-engagement-form";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="lg"
      title="New engagement"
      description="Drop a client URL to spin up a fresh consulting research project."
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
            form={formId}
            variant="primary"
            loading={submitting}
          >
            Create engagement
          </Button>
        </div>
      }
    >
      <form id={formId} className="space-y-4" onSubmit={handleSubmit}>
        <Input
          label="Client URL"
          required
          autoFocus
          placeholder="https://examplehealthclinic.com"
          value={clientUrl}
          onChange={(event) => setClientUrl(event.target.value)}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Project name (optional)"
            placeholder="Q3 market scan"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <Input
            label="Client industry (optional)"
            placeholder="Outpatient healthcare"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          />
          <Input
            label="Geography (optional)"
            placeholder="United States"
            value={geography}
            onChange={(event) => setGeography(event.target.value)}
          />
          <Input
            label="Known competitors (optional)"
            placeholder="onemedical.com, carbonhealth.com"
            value={knownCompetitors}
            onChange={(event) => setKnownCompetitors(event.target.value)}
            hint="Comma- or newline-separated URLs"
          />
        </div>
        <Textarea
          label="Notes (optional)"
          placeholder="Any prior knowledge or specific angles to focus on…"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-[var(--muted)]">
            Tabs to include
          </legend>
          <p className="text-[11px] text-[var(--muted)]">
            Pick the research tabs you want for this engagement. You can add or
            remove tabs later from the engagement page.
          </p>
          <AgentTabSelector
            selected={enabledAgents}
            onChange={setEnabledAgents}
            disabled={submitting}
            idPrefix="new-engagement-tab"
          />
        </fieldset>

        {error && (
          <p className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
