import { readNdjsonStream } from "@/lib/ndjson";

export async function readErrorBody(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof payload.error === "string") return payload.error;
    if (payload.error && typeof payload.error === "object" && payload.error.message) {
      return payload.error.message;
    }
    if (payload.message) return payload.message;
  } catch {
    // Fall back to text below.
  }

  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return response.statusText || "Unknown error";
  }
}

export async function consumeNdjsonStream(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  if (!response.body) return;
  await readNdjsonStream(response.body, onEvent);
}

function extractMessageContent(payload: unknown) {
  const choice = (payload as {
    choices?: Array<{ message?: { content?: string } }>;
  })?.choices?.[0];
  return choice?.message?.content?.trim() ?? "";
}

function extractDeltaContent(payload: unknown) {
  const choice = (payload as {
    choices?: Array<{ delta?: { content?: string } }>;
  })?.choices?.[0];
  return choice?.delta?.content ?? "";
}

function extractSseData(rawEvent: string) {
  const dataLines: string[] = [];
  for (const line of rawEvent.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  return dataLines.join("\n").trim();
}

export async function consumeChatCompletionStream(
  response: Response,
  onChunk: (content: string, delta: string) => void
) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = await response.json();
    const content = extractMessageContent(payload);
    if (content) onChunk(content, content);
    return content;
  }

  if (!response.body) {
    throw new Error("Provider returned no streaming body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  const processEvent = (rawEvent: string) => {
    const data = extractSseData(rawEvent);
    if (!data || data === "[DONE]") return data === "[DONE]";

    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return false;
    }

    const delta = extractDeltaContent(payload);
    if (!delta) return false;

    accumulated += delta;
    onChunk(accumulated, delta);
    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r/g, "");
    if (done) {
      buffer += decoder.decode().replace(/\r/g, "");
    }

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      if (processEvent(rawEvent)) {
        return accumulated;
      }
    }

    if (done) break;
  }

  if (buffer.trim()) {
    processEvent(buffer);
  }

  return accumulated;
}
