import { describe, it, expect, vi } from "vitest";
import {
  readErrorBody,
  consumeNdjsonStream,
  consumeChatCompletionStream,
} from "./streaming";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/** Build a ReadableStream that emits the given chunks sequentially. */
function chunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** Build a Response whose `.json()` resolves to `body`. */
function jsonResponse(body: unknown, status = 200, statusText = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "content-type": "application/json" },
  });
}

/** Build a Response whose `.text()` resolves to `text`. */
function textResponse(text: string, status = 500, statusText = ""): Response {
  return new Response(text, { status, statusText });
}

/** Build a streaming Response with `text/event-stream` content-type. */
function sseResponse(chunks: string[]): Response {
  return new Response(chunkedStream(chunks), {
    headers: { "content-type": "text/event-stream" },
  });
}

// ---------------------------------------------------------------------------
// readErrorBody
// ---------------------------------------------------------------------------

describe("readErrorBody", () => {
  it("returns string error field from JSON", async () => {
    const res = jsonResponse({ error: "something went wrong" });
    expect(await readErrorBody(res)).toBe("something went wrong");
  });

  it("returns error.message from object error field", async () => {
    const res = jsonResponse({ error: { message: "nested error" } });
    expect(await readErrorBody(res)).toBe("nested error");
  });

  it("returns message field when error is absent", async () => {
    const res = jsonResponse({ message: "top-level message" });
    expect(await readErrorBody(res)).toBe("top-level message");
  });

  it("falls back to response text when JSON parsing fails", async () => {
    // Override .json() to throw without consuming the body so .text() succeeds.
    const res = textResponse("plain text error body");
    const originalText = res.text.bind(res);
    res.json = () => Promise.reject(new SyntaxError("Unexpected token"));
    res.text = originalText;
    expect(await readErrorBody(res)).toBe("plain text error body");
  });

  it("truncates text fallback to 300 characters", async () => {
    const longText = "x".repeat(500);
    const res = textResponse(longText);
    const originalText = res.text.bind(res);
    res.json = () => Promise.reject(new SyntaxError("Unexpected token"));
    res.text = originalText;
    const result = await readErrorBody(res);
    expect(result).toHaveLength(300);
    expect(result).toBe("x".repeat(300));
  });

  it("returns statusText when both json and text fail", async () => {
    const res = new Response(null, { status: 502, statusText: "Bad Gateway" });
    res.json = () => Promise.reject(new Error("json failed"));
    res.text = () => Promise.reject(new Error("text failed"));
    const result = await readErrorBody(res);
    expect(result).toBe("Bad Gateway");
  });

  it('returns "Unknown error" when statusText is also empty', async () => {
    const res = new Response(null, { status: 500, statusText: "" });
    res.json = () => Promise.reject(new Error("json failed"));
    res.text = () => Promise.reject(new Error("text failed"));
    const result = await readErrorBody(res);
    expect(result).toBe("Unknown error");
  });
});

// ---------------------------------------------------------------------------
// consumeNdjsonStream
// ---------------------------------------------------------------------------

describe("consumeNdjsonStream", () => {
  it("returns early when response has no body", async () => {
    const res = new Response(null);
    const onEvent = vi.fn();
    await consumeNdjsonStream(res, onEvent);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("forwards parsed NDJSON events to the callback", async () => {
    const lines = [
      JSON.stringify({ type: "status", code: 1 }),
      JSON.stringify({ type: "data", value: "hello" }),
      JSON.stringify({ type: "end" }),
    ].join("\n");

    const res = new Response(chunkedStream([lines]), {
      headers: { "content-type": "application/x-ndjson" },
    });

    const events: Record<string, unknown>[] = [];
    await consumeNdjsonStream(res, (e) => events.push(e));

    expect(events).toEqual([
      { type: "status", code: 1 },
      { type: "data", value: "hello" },
      { type: "end" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// consumeChatCompletionStream
// ---------------------------------------------------------------------------

describe("consumeChatCompletionStream", () => {
  describe("JSON (non-streaming) responses", () => {
    it("extracts message content from JSON response", async () => {
      const payload = {
        choices: [{ message: { content: "Hello, world!" } }],
      };
      const res = jsonResponse(payload);
      const onChunk = vi.fn();

      const result = await consumeChatCompletionStream(res, onChunk);

      expect(result).toBe("Hello, world!");
      expect(onChunk).toHaveBeenCalledWith("Hello, world!", "Hello, world!");
    });

    it("returns empty string when choices array is empty", async () => {
      const payload = { choices: [] };
      const res = jsonResponse(payload);
      const onChunk = vi.fn();

      const result = await consumeChatCompletionStream(res, onChunk);

      expect(result).toBe("");
      expect(onChunk).not.toHaveBeenCalled();
    });

    it("trims whitespace from message content", async () => {
      const payload = {
        choices: [{ message: { content: "  trimmed  " } }],
      };
      const res = jsonResponse(payload);
      const onChunk = vi.fn();

      const result = await consumeChatCompletionStream(res, onChunk);

      expect(result).toBe("trimmed");
    });
  });

  describe("SSE streaming responses", () => {
    it("throws when there is no body and content-type is not JSON", async () => {
      const res = new Response(null, {
        headers: { "content-type": "text/event-stream" },
      });

      await expect(
        consumeChatCompletionStream(res, vi.fn()),
      ).rejects.toThrow("Provider returned no streaming body");
    });

    it("accumulates deltas from multiple SSE chunks", async () => {
      const event1 = `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`;
      const event2 = `data: ${JSON.stringify({ choices: [{ delta: { content: " world" } }] })}\n\n`;
      const event3 = `data: [DONE]\n\n`;

      const res = sseResponse([event1, event2, event3]);
      const chunks: Array<{ content: string; delta: string }> = [];
      const onChunk = (content: string, delta: string) =>
        chunks.push({ content, delta });

      const result = await consumeChatCompletionStream(res, onChunk);

      expect(result).toBe("Hello world");
      expect(chunks).toEqual([
        { content: "Hello", delta: "Hello" },
        { content: "Hello world", delta: " world" },
      ]);
    });

    it("stops processing on [DONE] event", async () => {
      const event1 = `data: ${JSON.stringify({ choices: [{ delta: { content: "first" } }] })}\n\n`;
      const done = `data: [DONE]\n\n`;
      const event2 = `data: ${JSON.stringify({ choices: [{ delta: { content: "second" } }] })}\n\n`;

      const res = sseResponse([event1, done, event2]);
      const onChunk = vi.fn();

      const result = await consumeChatCompletionStream(res, onChunk);

      expect(result).toBe("first");
      expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it("skips malformed JSON in SSE data lines", async () => {
      const good = `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`;
      const bad = `data: {not valid json\n\n`;
      const good2 = `data: ${JSON.stringify({ choices: [{ delta: { content: "!" } }] })}\n\n`;

      const res = sseResponse([good, bad, good2]);
      const onChunk = vi.fn();

      const result = await consumeChatCompletionStream(res, onChunk);

      expect(result).toBe("ok!");
      expect(onChunk).toHaveBeenCalledTimes(2);
    });

    it("skips events with no delta content", async () => {
      const empty = `data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n`;
      const withContent = `data: ${JSON.stringify({ choices: [{ delta: { content: "hi" } }] })}\n\n`;

      const res = sseResponse([empty, withContent]);
      const onChunk = vi.fn();

      const result = await consumeChatCompletionStream(res, onChunk);

      expect(result).toBe("hi");
      expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it("processes trailing buffer after stream ends", async () => {
      // Send a single chunk that does NOT end with \n\n, so it stays in buffer
      const event = `data: ${JSON.stringify({ choices: [{ delta: { content: "trailing" } }] })}`;

      const res = sseResponse([event]);
      const onChunk = vi.fn();

      const result = await consumeChatCompletionStream(res, onChunk);

      expect(result).toBe("trailing");
      expect(onChunk).toHaveBeenCalledWith("trailing", "trailing");
    });

    it("skips SSE comment lines starting with ':'", async () => {
      const comment = `: this is a comment\n`;
      const event = `data: ${JSON.stringify({ choices: [{ delta: { content: "value" } }] })}\n\n`;

      // Comment embedded inside an event block (same double-newline-delimited segment)
      const combined = `${comment}data: ${JSON.stringify({ choices: [{ delta: { content: "value" } }] })}\n\n`;

      const res = sseResponse([combined]);
      const onChunk = vi.fn();

      const result = await consumeChatCompletionStream(res, onChunk);

      expect(result).toBe("value");
      expect(onChunk).toHaveBeenCalledTimes(1);
    });

    it("strips \\r characters from the stream", async () => {
      const event = `data: ${JSON.stringify({ choices: [{ delta: { content: "clean" } }] })}\r\n\r\n`;

      const res = sseResponse([event]);
      const onChunk = vi.fn();

      const result = await consumeChatCompletionStream(res, onChunk);

      expect(result).toBe("clean");
    });

    it("handles chunks split across multiple reads", async () => {
      // Simulate the stream splitting mid-event by delivering partial chunks
      const fullEvent = `data: ${JSON.stringify({ choices: [{ delta: { content: "split" } }] })}\n\n`;
      const midpoint = Math.floor(fullEvent.length / 2);
      const chunk1 = fullEvent.slice(0, midpoint);
      const chunk2 = fullEvent.slice(midpoint);

      const res = sseResponse([chunk1, chunk2]);
      const onChunk = vi.fn();

      const result = await consumeChatCompletionStream(res, onChunk);

      expect(result).toBe("split");
    });
  });
});
