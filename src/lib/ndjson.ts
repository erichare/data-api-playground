/**
 * Shared NDJSON (newline-delimited JSON) stream reader.
 *
 * Reads a `ReadableStream<Uint8Array>`, splits on newlines, and
 * calls `onEvent` for each successfully parsed JSON line. Malformed
 * lines are silently skipped so that a single bad payload does not
 * crash the entire stream consumer.
 *
 * Errors thrown by `onEvent` are NOT caught — they propagate to the
 * caller so that application-level error handling works as expected.
 */
export async function readNdjsonStream<T = Record<string, unknown>>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    if (done) {
      buffer += decoder.decode();
    }

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      let parsed: T;
      try {
        parsed = JSON.parse(line) as T;
      } catch {
        // Skip malformed NDJSON lines
        continue;
      }
      onEvent(parsed);
    }

    if (done) break;
  }

  if (buffer.trim()) {
    let parsed: T;
    try {
      parsed = JSON.parse(buffer) as T;
    } catch {
      // Skip malformed trailing content
      return;
    }
    onEvent(parsed);
  }
}
