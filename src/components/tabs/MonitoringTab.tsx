"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Monitor,
  MonitorFinding,
  MonitorRunSummary,
  MonitorSource,
  MonitorSourceKind,
} from "@/types/monitoring";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import {
  FindingKindChip,
  FindingSeverityChip,
  SourceKindChip,
} from "@/components/monitoring/FindingChips";
import { formatRelativeFuture, formatRelativeTime } from "@/lib/relativeTime";
import { getDomain, normalizeUrl } from "@/lib/url";

const POLL_INTERVAL_MS = 15_000;
const SOURCE_KINDS: MonitorSourceKind[] = [
  "client",
  "competitor",
  "emerging",
  "other",
];

const SOURCE_KIND_OPTION_LABEL: Record<MonitorSourceKind, string> = {
  client: "Client",
  competitor: "Competitor",
  emerging: "Emerging",
  other: "Other",
};
const INTERVAL_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 15, label: "Every 15 min" },
  { minutes: 30, label: "Every 30 min" },
  { minutes: 60, label: "Hourly" },
  { minutes: 180, label: "Every 3 hours" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 720, label: "Every 12 hours" },
  { minutes: 1440, label: "Daily" },
];

interface MonitorBundle {
  monitor: Monitor;
  findings: MonitorFinding[];
  runs: MonitorRunSummary[];
}

interface MonitoringTabProps {
  engagementId: string;
}

/**
 * Per-engagement monitoring control panel + findings feed. Owns its own
 * data lifecycle (fetch + poll) so it can stay live without re-mounting
 * the parent engagement page.
 */
export function MonitoringTab({ engagementId }: MonitoringTabProps) {
  const [bundle, setBundle] = useState<MonitorBundle | null>(null);
  // `hasLoaded` is set after the first fetch resolves (success or
  // failure) — used in render to decide between "Loading…" and "no
  // monitor" empty states. Plain state, not a ref, so React 19 is happy
  // with us reading it during render.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [savingIntent, setSavingIntent] = useState<
    "enabled" | "interval" | "sources" | "read" | null
  >(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  const fetchBundle = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(
        `/api/engagements/${engagementId}/monitor`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const json = (await response.json()) as MonitorBundle;
      setBundle(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load monitor");
    } finally {
      setHasLoaded(true);
    }
  }, [engagementId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBundle();
    const interval = setInterval(fetchBundle, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchBundle]);

  const patchMonitor = useCallback(
    async (
      patch: Partial<{
        enabled: boolean;
        intervalMinutes: number;
        sources: MonitorSource[];
      }>,
      intent: "enabled" | "interval" | "sources",
    ): Promise<void> => {
      setSavingIntent(intent);
      setError(null);
      try {
        const response = await fetch(
          `/api/engagements/${engagementId}/monitor`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            payload.error ?? `Failed to update monitor (${response.status})`,
          );
        }
        const json = (await response.json()) as { monitor: Monitor };
        setBundle((prev) =>
          prev ? { ...prev, monitor: json.monitor } : prev,
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update monitor",
        );
      } finally {
        setSavingIntent(null);
      }
    },
    [engagementId],
  );

  const runNow = useCallback(async (): Promise<void> => {
    if (!bundle) return;
    setRunning(true);
    setRunMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/engagements/${engagementId}/monitor/run`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        summary?: MonitorRunSummary;
        newFindings?: MonitorFinding[];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `Run failed (${response.status})`);
      }
      const found = payload.newFindings?.length ?? 0;
      setRunMessage(
        found === 0
          ? "Crawl finished — no new findings since the last run."
          : `Crawl finished — ${found} new finding${found === 1 ? "" : "s"}.`,
      );
      await fetchBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }, [bundle, engagementId, fetchBundle]);

  const markAllRead = useCallback(async (): Promise<void> => {
    setSavingIntent("read");
    setError(null);
    try {
      const response = await fetch(
        `/api/engagements/${engagementId}/monitor/findings/read`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Failed to mark read");
      }
      await fetchBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark read");
    } finally {
      setSavingIntent(null);
    }
  }, [engagementId, fetchBundle]);

  if (!hasLoaded) {
    return (
      <p className="text-xs text-[var(--muted)]">Loading monitoring state…</p>
    );
  }

  if (!bundle) {
    return (
      <EmptyState
        title="Monitoring unavailable"
        description={
          error ??
          "Could not load monitoring state for this engagement. Try refreshing."
        }
      />
    );
  }

  const { monitor, findings, runs } = bundle;
  const unread = findings.filter((f) => !f.read).length;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}
      {runMessage && (
        <div className="rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/[0.06] px-3 py-2 text-xs text-[var(--accent)]">
          {runMessage}
        </div>
      )}

      <ControlsCard
        monitor={monitor}
        running={running}
        savingIntent={savingIntent}
        onToggleEnabled={(enabled) => patchMonitor({ enabled }, "enabled")}
        onChangeInterval={(minutes) =>
          patchMonitor({ intervalMinutes: minutes }, "interval")
        }
        onRunNow={runNow}
      />

      <SourcesCard
        monitor={monitor}
        savingIntent={savingIntent}
        onUpdate={(sources) => patchMonitor({ sources }, "sources")}
      />

      <FindingsCard
        findings={findings}
        unread={unread}
        savingIntent={savingIntent}
        onMarkAllRead={markAllRead}
      />

      <RunsCard runs={runs} />
    </div>
  );
}

interface ControlsCardProps {
  monitor: Monitor;
  running: boolean;
  savingIntent: "enabled" | "interval" | "sources" | "read" | null;
  onToggleEnabled: (enabled: boolean) => void;
  onChangeInterval: (minutes: number) => void;
  onRunNow: () => void;
}

function ControlsCard({
  monitor,
  running,
  savingIntent,
  onToggleEnabled,
  onChangeInterval,
  onRunNow,
}: ControlsCardProps) {
  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Continuous monitoring
            </h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Agents revisit each source on a fixed cadence and surface new
              news, posts, and announcements as findings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={monitor.enabled ? "secondary" : "primary"}
              onClick={() => onToggleEnabled(!monitor.enabled)}
              loading={savingIntent === "enabled"}
            >
              {monitor.enabled ? "Pause" : "Resume"}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={onRunNow}
              loading={running}
              disabled={monitor.sources.length === 0}
              title={
                monitor.sources.length === 0
                  ? "Add at least one source first"
                  : "Crawl every source now"
              }
            >
              Run now
            </Button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Status"
            value={
              monitor.enabled ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Badge tone="muted">Paused</Badge>
              )
            }
          />
          <Stat
            label="Last run"
            value={
              monitor.lastRunAt
                ? formatRelativeTime(monitor.lastRunAt)
                : "Never"
            }
          />
          <Stat
            label="Next run"
            value={
              monitor.enabled
                ? formatRelativeFuture(monitor.nextRunAt)
                : "Paused"
            }
          />
          <Stat
            label="Total findings"
            value={`${monitor.totalFindings}`}
          />
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--muted)]">
            Cadence
          </span>
          <select
            value={monitor.intervalMinutes}
            onChange={(event) => onChangeInterval(Number(event.target.value))}
            disabled={savingIntent === "interval"}
            className="rounded-input border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs"
          >
            {INTERVAL_OPTIONS.map((option) => (
              <option key={option.minutes} value={option.minutes}>
                {option.label}
              </option>
            ))}
          </select>
          {savingIntent === "interval" && (
            <span className="text-[11px] text-[var(--muted)]">Saving…</span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

interface SourcesCardProps {
  monitor: Monitor;
  savingIntent: "enabled" | "interval" | "sources" | "read" | null;
  onUpdate: (sources: MonitorSource[]) => void;
}

function SourcesCard({ monitor, savingIntent, onUpdate }: SourcesCardProps) {
  const [draftUrl, setDraftUrl] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftKind, setDraftKind] = useState<MonitorSourceKind>("competitor");
  const [localError, setLocalError] = useState<string | null>(null);

  const addSource = (): void => {
    setLocalError(null);
    const canonical = normalizeUrl(draftUrl);
    if (!canonical || !/^https?:\/\//i.test(canonical)) {
      setLocalError("Enter a valid http(s) URL");
      return;
    }
    const domain = getDomain(canonical).toLowerCase();
    if (
      monitor.sources.some(
        (source) => getDomain(source.url).toLowerCase() === domain,
      )
    ) {
      setLocalError("That domain is already being monitored");
      return;
    }
    const id = `src_${draftKind}_${domain.replace(/[^a-z0-9]+/g, "_")}`;
    const next: MonitorSource = {
      id,
      url: canonical,
      label: draftLabel.trim() || domain,
      kind: draftKind,
      addedAt: new Date().toISOString(),
    };
    onUpdate([...monitor.sources, next]);
    setDraftUrl("");
    setDraftLabel("");
  };

  const removeSource = (sourceId: string): void => {
    onUpdate(monitor.sources.filter((source) => source.id !== sourceId));
  };

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Sources</h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              The websites our crawlers revisit on every run. The client URL
              and any known competitors are added automatically; new
              competitors discovered by the pipeline are added here too.
            </p>
          </div>
          <Badge tone="muted">
            {monitor.sources.length} source
            {monitor.sources.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {monitor.sources.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="No sources yet"
            description="Add a client or competitor URL below to start monitoring."
          />
        ) : (
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {monitor.sources.map((source) => (
              <li
                key={source.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <SourceKindChip kind={source.kind} />
                    <span className="truncate text-sm font-medium">
                      {source.label}
                    </span>
                  </div>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 block truncate text-xs text-[var(--accent)] hover:underline"
                  >
                    {source.url}
                  </a>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    {source.lastCrawledAt
                      ? `Last crawled ${formatRelativeTime(source.lastCrawledAt)}`
                      : "Not yet crawled"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSource(source.id)}
                  disabled={savingIntent === "sources"}
                  aria-label={`Remove ${source.label}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-alt)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Add a source
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <Input
                placeholder="https://competitor.com"
                value={draftUrl}
                onChange={(event) => setDraftUrl(event.target.value)}
              />
            </div>
            <div className="sm:col-span-4">
              <Input
                placeholder="Display label (optional)"
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <select
                value={draftKind}
                onChange={(event) =>
                  setDraftKind(event.target.value as MonitorSourceKind)
                }
                className="h-full w-full rounded-input border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm"
              >
                {SOURCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {SOURCE_KIND_OPTION_LABEL[kind]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <Button
                size="md"
                onClick={addSource}
                loading={savingIntent === "sources"}
                className="w-full"
              >
                Add
              </Button>
            </div>
          </div>
          {localError && (
            <p className="mt-2 text-xs text-[var(--danger)]">{localError}</p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

interface FindingsCardProps {
  findings: MonitorFinding[];
  unread: number;
  savingIntent: "enabled" | "interval" | "sources" | "read" | null;
  onMarkAllRead: () => void;
}

function FindingsCard({
  findings,
  unread,
  savingIntent,
  onMarkAllRead,
}: FindingsCardProps) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Findings</h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              The most recent updates surfaced by the monitoring agents,
              newest first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <Badge tone="info">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--info)] pulse-dot" />
                {unread} unread
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkAllRead}
              disabled={unread === 0}
              loading={savingIntent === "read"}
            >
              Mark all read
            </Button>
          </div>
        </div>

        {findings.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="No findings yet"
            description="Run the monitor (or wait for the next scheduled tick) to surface new news and site updates."
          />
        ) : (
          <ul className="mt-4 space-y-2">
            {findings.map((finding) => (
              <li key={finding.id}>
                <FindingRow finding={finding} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function FindingRow({ finding }: { finding: MonitorFinding }) {
  const accent = !finding.read;
  const domain = getDomain(finding.url);
  return (
    <article
      className={`rounded-md border px-3 py-2.5 ${
        accent
          ? "border-[var(--accent)]/30 bg-[var(--accent)]/[0.04]"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <SourceKindChip kind={finding.source.kind} />
        <span className="text-[var(--muted)]">{finding.source.label}</span>
        <FindingKindChip kind={finding.kind} />
        {finding.severity !== "info" && (
          <FindingSeverityChip severity={finding.severity} />
        )}
        <span className="ml-auto font-mono text-[10px] text-[var(--muted)]">
          {formatRelativeTime(finding.discoveredAt)}
        </span>
      </div>
      <h4 className="mt-1.5 text-sm font-semibold tracking-tight">
        {finding.title}
      </h4>
      {finding.summary && (
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          {finding.summary}
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <a
          href={finding.url}
          target="_blank"
          rel="noreferrer"
          className="truncate font-medium text-[var(--accent)] hover:underline"
        >
          {domain} ↗
        </a>
        {finding.publishedDate && (
          <span className="font-mono text-[10px] text-[var(--muted)]">
            published {formatRelativeTime(finding.publishedDate)}
          </span>
        )}
      </div>
    </article>
  );
}

interface RunsCardProps {
  runs: MonitorRunSummary[];
}

function RunsCard({ runs }: RunsCardProps) {
  if (runs.length === 0) return null;
  return (
    <Card>
      <CardBody>
        <h3 className="text-sm font-semibold tracking-tight">Recent runs</h3>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          A short log of the last few crawls. Errors here mean a single
          source failed; the run itself still completes.
        </p>
        <ul className="mt-3 divide-y divide-[var(--border)] text-xs">
          {runs.map((run) => (
            <li
              key={run.monitorRunId}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
            >
              <span className="font-mono text-[11px] text-[var(--muted)]">
                {formatRelativeTime(run.completedAt)}
              </span>
              <span>
                {run.sourcesScanned} source{run.sourcesScanned === 1 ? "" : "s"}{" "}
                scanned
              </span>
              <span className="text-[var(--muted)]">·</span>
              <span>
                {run.newFindings} new finding
                {run.newFindings === 1 ? "" : "s"}
              </span>
              {run.errors.length > 0 && (
                <Badge tone="warning">
                  {run.errors.length} error
                  {run.errors.length === 1 ? "" : "s"}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
