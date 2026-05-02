"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, Engagement } from "@/types/engagement";
import type { ResultsByAgent } from "@/lib/db";
import type { CustomResultsByTabId } from "@/lib/customTabs";
import { parseSseStream, SSE_DONE, tryParseJson } from "@/lib/sse";

export type { ResultsByAgent } from "@/lib/db";
export type { CustomResultsByTabId } from "@/lib/customTabs";

interface EngagementBundle {
  engagement: Engagement;
  results: ResultsByAgent;
  customResults?: CustomResultsByTabId;
}

export interface UseEngagementStreamReturn {
  engagement: Engagement | null;
  results: ResultsByAgent;
  customResults: CustomResultsByTabId;
  events: AgentEvent[];
  isRunning: boolean;
  hasRun: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  run: () => Promise<void>;
  stop: () => void;
}

export function useEngagementStream(
  engagementId: string,
): UseEngagementStreamReturn {
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [results, setResults] = useState<ResultsByAgent>({});
  const [customResults, setCustomResults] = useState<CustomResultsByTabId>({});
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const fetchSnapshot = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/engagements/${engagementId}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const json = (await response.json()) as EngagementBundle;
      setEngagement(json.engagement);
      setResults(json.results);
      setCustomResults(json.customResults ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [engagementId]);

  useEffect(() => {
    // setState happens after the fetch resolves, not synchronously in the
    // effect body, so the React 19 cascading-render concern doesn't apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSnapshot();
  }, [fetchSnapshot]);

  const stop = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = false;
    setIsRunning(false);
  }, []);

  const run = useCallback(async (): Promise<void> => {
    if (runningRef.current) return;
    runningRef.current = true;

    setError(null);
    setHasRun(true);
    setIsRunning(true);
    setEvents([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`/api/engagements/${engagementId}/run`, {
        method: "POST",
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });

      if (!response.ok || !response.body) {
        throw new Error(`Run failed: ${response.status}`);
      }

      for await (const payload of parseSseStream(response.body)) {
        if (payload === SSE_DONE) continue;
        const event = tryParseJson<AgentEvent>(payload);
        if (!event) continue;

        setEvents((prev) => [...prev, event]);

        if (
          event.type === "agent_started" ||
          event.type === "agent_completed" ||
          event.type === "agent_failed" ||
          event.type === "pipeline_started" ||
          event.type === "pipeline_completed" ||
          event.type === "pipeline_failed"
        ) {
          fetchSnapshot();
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Pipeline error");
    } finally {
      runningRef.current = false;
      abortRef.current = null;
      setIsRunning(false);
      fetchSnapshot();
    }
  }, [engagementId, fetchSnapshot]);

  useEffect(() => stop, [stop]);

  return {
    engagement,
    results,
    customResults,
    events,
    isRunning,
    hasRun,
    error,
    refresh: fetchSnapshot,
    run,
    stop,
  };
}
