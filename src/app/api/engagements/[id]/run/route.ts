import type { AgentEvent } from "@/types/engagement";
import { getEngagement } from "@/lib/db";
import { runPipeline } from "@/lib/agents/orchestrator";
import { encodeSseEvent, SSE_KEEPALIVE } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEARTBEAT_INTERVAL_MS = 15_000;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const engagement = await getEngagement(id);
  if (!engagement) {
    return new Response(JSON.stringify({ error: "Not found" }), {
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

      const send = (event: AgentEvent): void => {
        safeEnqueue(encodeSseEvent(event));
      };

      const heartbeat = setInterval(() => {
        safeEnqueue(SSE_KEEPALIVE);
      }, HEARTBEAT_INTERVAL_MS);

      try {
        await runPipeline(id, { emit: send });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Pipeline error";
        send({
          engagementId: id,
          agent: "orchestrator",
          type: "pipeline_failed",
          message,
          timestamp: new Date().toISOString(),
        });
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
