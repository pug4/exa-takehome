export const SSE_DONE = "[DONE]";

/**
 * Parse a Server-Sent Events stream line-by-line and yield each `data:`
 * payload as a string. Yields `SSE_DONE` for `data: [DONE]` markers.
 *
 * Used by both the client (consuming our pipeline run stream) and the
 * server (consuming Exa's /search stream), so the parsing lives in one place.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer) {
          const remainder = extractDataPayload(buffer);
          if (remainder !== null) yield remainder;
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const payload = extractDataPayload(rawEvent);
        if (payload !== null) yield payload;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function extractDataPayload(rawEvent: string): string | null {
  const dataLines = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  return dataLines.join("\n");
}

export function tryParseJson<T>(payload: string): T | null {
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

export function encodeSseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export const SSE_KEEPALIVE = `: keepalive\n\n`;
