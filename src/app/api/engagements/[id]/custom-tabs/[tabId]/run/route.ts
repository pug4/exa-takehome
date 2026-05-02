import type { AgentEvent } from "@/types/engagement";
import { getEngagement } from "@/lib/db";
import { runCustomTab } from "@/lib/agents/custom-tab";
import { encodeSseEvent, SSE_KEEPALIVE } from "@/lib/sse";
import { appendEvent } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEARTBEAT_INTERVAL_MS = 15_000;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; tabId: string }> },
) {
  const { id, tabId } = await context.params;
  const engagement = await getEngagement(id);
  if (!engagement) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const tab = (engagement.customTabs ?? []).find((t) => t.id === tabId);
  if (!tab) {
    return new Response(JSON.stringify({ error: "Custom tab not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const safeEnqueue = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const heartbeat = setInterval(() => {
        safeEnqueue(SSE_KEEPALIVE);
      }, HEARTBEAT_INTERVAL_MS);

      try {
        await runCustomTab({
          engagement,
          tab,
          // Persist the event AND forward it so the client snapshot
          // history stays consistent with what's streamed live.
          emit: async (event) => {
            const fullEvent: AgentEvent = {
              ...event,
              engagementId: id,
              timestamp: new Date().toISOString(),
            };
            await appendEvent(fullEvent);
            safeEnqueue(encodeSseEvent(fullEvent));
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Custom tab run failed";
        safeEnqueue(
          encodeSseEvent({
            engagementId: id,
            agent: "orchestrator",
            type: "agent_failed",
            message,
            timestamp: new Date().toISOString(),
            data: { customTabId: tabId },
          } satisfies AgentEvent),
        );
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
