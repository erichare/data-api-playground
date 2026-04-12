import { describe, expect, it, vi } from "vitest";
import { readNdjsonStream } from "./ndjson";

/**
 * Build a ReadableStream<Uint8Array> from an array of string chunks.
 * Each string in `chunks` becomes one `read()` result.
 */
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe("readNdjsonStream", () => {
  it("parses a single complete NDJSON line", async () => {
    const onEvent = vi.fn();
    const stream = streamFromChunks(['{"a":1}\n']);

    await readNdjsonStream(stream, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ a: 1 });
  });

  it("parses multiple NDJSON lines in one chunk", async () => {
    const onEvent = vi.fn();
    const stream = streamFromChunks(['{"a":1}\n{"b":2}\n{"c":3}\n']);

    await readNdjsonStream(stream, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent).toHaveBeenNthCalledWith(1, { a: 1 });
    expect(onEvent).toHaveBeenNthCalledWith(2, { b: 2 });
    expect(onEvent).toHaveBeenNthCalledWith(3, { c: 3 });
  });

  it("handles a line split across two chunks (partial data buffering)", async () => {
    const onEvent = vi.fn();
    // Split '{"key":"value"}\n' across two chunks
    const stream = streamFromChunks(['{"key":', '"value"}\n']);

    await readNdjsonStream(stream, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ key: "value" });
  });

  it("skips empty lines", async () => {
    const onEvent = vi.fn();
    const stream = streamFromChunks(['{"a":1}\n\n\n{"b":2}\n']);

    await readNdjsonStream(stream, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, { a: 1 });
    expect(onEvent).toHaveBeenNthCalledWith(2, { b: 2 });
  });

  it("handles malformed JSON lines gracefully (skip without throwing)", async () => {
    const onEvent = vi.fn();
    const stream = streamFromChunks([
      '{"valid":1}\nnot-json\n{"also":2}\n{broken\n',
    ]);

    await readNdjsonStream(stream, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, { valid: 1 });
    expect(onEvent).toHaveBeenNthCalledWith(2, { also: 2 });
  });

  it("handles trailing newline without emitting extra events", async () => {
    const onEvent = vi.fn();
    const stream = streamFromChunks(['{"x":1}\n{"y":2}\n']);

    await readNdjsonStream(stream, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, { x: 1 });
    expect(onEvent).toHaveBeenNthCalledWith(2, { y: 2 });
  });

  it("handles empty input (no lines)", async () => {
    const onEvent = vi.fn();
    const stream = streamFromChunks([""]);

    await readNdjsonStream(stream, onEvent);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("handles a line without trailing newline (trailing data in buffer)", async () => {
    const onEvent = vi.fn();
    // No trailing newline -- the last line sits in the buffer until done
    const stream = streamFromChunks(['{"a":1}\n{"b":2}']);

    await readNdjsonStream(stream, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, { a: 1 });
    expect(onEvent).toHaveBeenNthCalledWith(2, { b: 2 });
  });

  it("skips whitespace-only lines", async () => {
    const onEvent = vi.fn();
    const stream = streamFromChunks(['{"a":1}\n   \n\t\n{"b":2}\n']);

    await readNdjsonStream(stream, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, { a: 1 });
    expect(onEvent).toHaveBeenNthCalledWith(2, { b: 2 });
  });

  it("handles data split across many small chunks", async () => {
    const onEvent = vi.fn();
    // Each character of '{"z":9}\n' arrives in its own chunk
    const line = '{"z":9}\n';
    const chunks = line.split("").map((ch) => ch);
    const stream = streamFromChunks(chunks);

    await readNdjsonStream(stream, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ z: 9 });
  });

  it("skips malformed trailing content after final newline", async () => {
    const onEvent = vi.fn();
    const stream = streamFromChunks(['{"ok":true}\n{bad']);

    await readNdjsonStream(stream, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ ok: true });
  });
});
