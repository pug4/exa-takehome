"use client";

import { useState } from "react";
import type { AgentStatus, Engagement } from "@/types/engagement";
import type { ResearchResult } from "@/types/research";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { EvidenceList } from "@/components/EvidenceList";
import { AgentResultEmpty } from "@/components/AgentResultEmpty";
import { getDomain } from "@/lib/url";

interface DeepAnalysisTabProps {
  engagement: Engagement;
  status: AgentStatus;
  result?: ResearchResult<"deepCompetitiveAnalysis">;
  onAnalysisComplete: () => void;
}

export function DeepAnalysisTab({
  engagement,
  status,
  result,
  onAnalysisComplete,
}: DeepAnalysisTabProps) {
  const [urlsInput, setUrlsInput] = useState(
    engagement.knownCompetitors?.join("\n") ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async (): Promise<void> => {
    setError(null);
    const competitorUrls = urlsInput
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (competitorUrls.length === 0) {
      setError("Add at least one competitor URL");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/engagements/${engagement.id}/deep-analysis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competitorUrls }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `Failed: ${response.status}`);
      }
      onAnalysisComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const data = result?.data;
  const profiles = data?.competitorProfiles ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Drop competitor URLs</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Paste competitor URLs (one per line or comma-separated) and run a
              detailed teardown across positioning, products, pricing, GTM, and
              gaps.
            </p>
          </div>
          <Textarea
            value={urlsInput}
            onChange={(event) => setUrlsInput(event.target.value)}
            placeholder={"https://onemedical.com\nhttps://carbonhealth.com"}
            rows={4}
          />
          {error && (
            <p className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end">
            <Button onClick={handleRun} loading={submitting}>
              Run deep analysis
            </Button>
          </div>
        </CardBody>
      </Card>

      {profiles.length === 0 ? (
        <AgentResultEmpty
          status={status}
          pendingTitle="No deep analysis yet"
          pendingDescription="Drop competitor URLs above to run a detailed teardown."
        />
      ) : (
        <div className="space-y-4">
          {data?.summary && (
            <Card>
              <CardBody>
                <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Client vs competitors
                </h4>
                <p className="mt-2 text-sm leading-relaxed">{data.summary}</p>
              </CardBody>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3">
            {profiles.map((profile, index) => (
              <Card key={`${profile.name}-${index}`}>
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold">{profile.name}</h4>
                      <a
                        href={profile.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[var(--info)] hover:underline"
                      >
                        {getDomain(profile.url)}
                      </a>
                    </div>
                  </div>

                  <div>
                    <Label>Positioning, customers & GTM</Label>
                    <Body>{profile.positioning}</Body>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <BulletField label="Offering" items={profile.productOrServiceOffering} />
                    <BulletField label="Differentiators" items={profile.differentiators} />
                    <BulletField label="Weaknesses / gaps" items={profile.weaknessesOrGaps} />
                  </div>

                  {profile.pricingSignals && (
                    <KeyValue label="Pricing" value={profile.pricingSignals} />
                  )}

                  <EvidenceList urls={profile.evidenceUrls} className="pt-1" />
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h5 className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
      {children}
    </h5>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm">{children}</p>;
}

function BulletField({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <Label>{label}</Label>
      <ul className="mt-1 space-y-1 text-xs">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>· {item}</li>
        ))}
      </ul>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-alt)] p-3">
      <Label>{label}</Label>
      <p className="mt-1 text-xs">{value}</p>
    </div>
  );
}
