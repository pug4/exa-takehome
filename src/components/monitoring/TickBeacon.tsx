"use client";

import { useEffect, useRef } from "react";

const TICK_INTERVAL_MS = 60_000;
const FIRST_TICK_DELAY_MS = 5_000;

/**
 * Lightweight client-side scheduler for the monitoring system.
 *
 * While a user has the workspace open, this component pings
 * `POST /api/monitor/tick` once a minute. The endpoint is idempotent —
 * monitors that aren't yet due return early — so this is essentially free
 * if nothing is overdue. In production you'd also want a Vercel Cron
 * hitting the same endpoint, but the beacon makes the demo feel "alive"
 * without any external infrastructure.
 *
 * Pauses while the tab is hidden to avoid burning Exa quota when nobody
 * is watching.
 */
export function TickBeacon() {
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      if (inFlightRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;

      inFlightRef.current = true;
      try {
        await fetch("/api/monitor/tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Tick is fire-and-forget; we don't need the response body.
          keepalive: true,
        });
      } catch {
        // Tick failures are expected occasionally (cold start, network).
        // We rely on the next interval to retry, so swallowing here is
        // intentional rather than a missed error.
      } finally {
        inFlightRef.current = false;
      }
    };

    const initialTimer = setTimeout(tick, FIRST_TICK_DELAY_MS);
    const interval = setInterval(tick, TICK_INTERVAL_MS);

    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        // Catch up immediately when the tab regains focus.
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
