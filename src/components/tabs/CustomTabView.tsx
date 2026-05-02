"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentEvent } from "@/types/engagement";
import type { CustomTab, CustomTabResult } from "@/types/customTab";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AgentStatusBadge } from "@/components/AgentStatusBadge";
import { EvidenceList } from "@/components/EvidenceList";
import { parseSseStream, SSE_DONE, tryParseJson } from "@/lib/sse";

interface CustomTabViewProps {
  engagementId: string;
  tab: CustomTab;
  result?: CustomTabResult;
  /** Called after a successful run so the parent can refetch state. */
  onAfterRun: () => Promise<void> | void;
  /** Called when the user removes the tab; parent handles routing. */
  onDelete: () => void;
}

/**
 * Important: callers should pass `key={tab.id}` so React fully remounts the
 * view when the user navigates between custom tabs. That keeps the local
 * stream state (running / partial markdown / error) per-tab without an
 * effect-driven reset.
 */
export function CustomTabView({
  engagementId,
  tab,
  result,
  onAfterRun,
  onDelete,
}: CustomTabViewProps) {
  // Stream state. `streamingMarkdown` is what we render mid-flight; once
  // the stream completes we fall back to the persisted `result.data.markdown`
  // (which is identical, just sourced from the snapshot).
  const [streamingMarkdown, setStreamingMarkdown] = useState<string | null>(
    null,
  );
  const [isRunning, setIsRunning] = useState(tab.status === "running");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
  }, []);

  // Cleanup on unmount.
  useEffect(() => stop, [stop]);

  const run = useCallback(async (): Promise<void> => {
    if (isRunning) return;
    setError(null);
    setIsRunning(true);
    setStreamingMarkdown("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(
        `/api/engagements/${engagementId}/custom-tabs/${tab.id}/run`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { Accept: "text/event-stream" },
        },
      );
      if (!response.ok || !response.body) {
        throw new Error(`Run failed: ${response.status}`);
      }

      for await (const payload of parseSseStream(response.body)) {
        if (payload === SSE_DONE) continue;
        const event = tryParseJson<AgentEvent>(payload);
        if (!event) continue;
        const data = event.data as
          | { customTabId?: string; length?: number }
          | undefined;
        if (data?.customTabId !== tab.id) continue;

        if (event.type === "agent_progress" && typeof data.length === "number") {
          // We don't get the partial body in events; show a "drafting…"
          // placeholder driven by reported length.
          setStreamingMarkdown(
            (prev) => prev ?? `_Drafting answer (${data.length} chars)…_`,
          );
        }
        if (event.type === "agent_failed") {
          setError(event.message ?? "Custom tab failed");
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Custom tab run failed");
    } finally {
      abortRef.current = null;
      setIsRunning(false);
      setStreamingMarkdown(null);
      await onAfterRun();
    }
  }, [engagementId, tab.id, isRunning, onAfterRun]);

  const handleDelete = (): void => {
    // Confirmation is owned by the parent so the prompt is consistent
    // with the inline × removal in the tab bar.
    onDelete();
  };

  const markdown = result?.data?.markdown ?? streamingMarkdown ?? null;
  const hasContent = Boolean(markdown);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-sm bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                  Custom tab
                </span>
                <h2 className="truncate text-lg font-semibold tracking-tight">
                  {tab.label}
                </h2>
                <AgentStatusBadge status={tab.status} />
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">
                {tab.prompt}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isRunning ? (
                <Button variant="secondary" size="sm" onClick={stop}>
                  Stop
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={run}
                  icon={<RunIcon />}
                >
                  {tab.status === "complete" ? "Re-run" : "Run"}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleDelete}>
                Delete tab
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}

      {tab.status === "failed" && result?.error && !isRunning && (
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--danger)]">
              Last run failed
            </p>
            <p className="mt-1 text-sm">{result.error}</p>
          </CardBody>
        </Card>
      )}

      {hasContent ? (
        <Card>
          <CardBody className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown ?? ""}
            </ReactMarkdown>
          </CardBody>
        </Card>
      ) : (
        !isRunning && (
          <Card>
            <CardBody className="text-sm text-[var(--muted)]">
              <p>
                No answer generated yet. Click <strong>Run</strong> to send the
                prompt to the agent — or use <strong>Run pipeline</strong> in
                the engagement header to run every tab at once.
              </p>
            </CardBody>
          </Card>
        )
      )}

      {result?.citations && result.citations.length > 0 && !isRunning && (
        <Card>
          <CardBody>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Sources
            </p>
            <EvidenceList citations={result.citations} max={20} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function RunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
    >
      <path d="M8 5v14l11-7-11-7z" />
    </svg>
  );
}
