// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatSession } from "./useChatSession";

const defaultArgs = {
  messages: [] as Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    sources?: Array<{
      collection: string;
      id: string;
      similarity: number;
      preview: Record<string, string | number>;
    }>;
  }>,
  onMessagesUpdate: vi.fn(),
  astraToken: "AstraCS:secret",
  astraEndpoint: "https://db.apps.astra.datastax.com",
  keyspace: "default_keyspace",
  collections: [{ name: "orders", isVectorize: false, vectorDimension: 768 }],
  activeCollection: "orders",
  huggingfaceApiKey: "hf-key",
  collectionFields: { orders: ["total_spend", "status"] },
};

describe("useChatSession", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("exposes input state and refuses to send empty messages", async () => {
    global.fetch = vi.fn() as typeof fetch;

    const { result } = renderHook(() => useChatSession(defaultArgs));

    expect(result.current.canSend).toBe(false);

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(fetch).not.toHaveBeenCalled();

    act(() => {
      result.current.selectHint("Show me 5 records from orders");
    });

    expect(result.current.input).toBe("Show me 5 records from orders");
    expect(result.current.canSend).toBe(true);
  });

  it("streams events into a final assistant message and clears transient state", async () => {
    const onMessagesUpdate = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              step: "analyze",
              status: "complete",
              latencyMs: 5,
              data: { searchMode: "lexical" },
            })}\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              step: "search",
              status: "complete",
              latencyMs: 7,
              data: {
                collection: "orders",
                results: [
                  {
                    id: "doc-1",
                    similarity: 0.88,
                    preview: { total_spend: 500 },
                  },
                ],
              },
            })}\n`
          )
        );
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              step: "respond",
              status: "complete",
              latencyMs: 11,
              data: { content: "Use the lexical results." },
            })
          )
        );
        controller.close();
      },
    });

    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        searchMode: string;
        history: Array<{ role: string; content: string }>;
      };

      expect(body.searchMode).toBe("lexical");
      expect(body.history[0]?.content).toContain("[Search results shown to user:]");

      return new Response(stream);
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useChatSession({
        ...defaultArgs,
        onMessagesUpdate,
        messages: [
          {
            id: "msg-old",
            role: "assistant",
            content: "Previous answer",
            timestamp: new Date("2026-03-30T12:00:00.000Z"),
            sources: [
              {
                collection: "orders",
                id: "doc-old",
                similarity: 0.9,
                preview: { total_spend: 100 },
              },
            ],
          },
        ],
      })
    );

    act(() => {
      result.current.setSearchMode("lexical");
      result.current.setInput("Find active orders");
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    await waitFor(() => {
      expect(onMessagesUpdate).toHaveBeenCalledTimes(2);
    });

    expect(onMessagesUpdate.mock.calls[0]?.[0].at(-1)).toMatchObject({
      role: "user",
      content: "Find active orders",
    });
    expect(onMessagesUpdate.mock.calls[1]?.[0].at(-1)).toMatchObject({
      role: "assistant",
      content: "Use the lexical results.",
      searchMode: "lexical",
      latencyMs: 23,
      sources: [
        {
          collection: "orders",
          id: "doc-1",
          similarity: 0.88,
          preview: { total_spend: 500 },
        },
      ],
      pipelineSteps: [
        expect.objectContaining({ id: "analyze", status: "complete" }),
        expect.objectContaining({ id: "search", status: "complete" }),
        expect.objectContaining({ id: "respond", status: "complete" }),
      ],
    });
    expect(result.current.input).toBe("");
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamingSteps).toEqual([]);
    expect(result.current.chatError).toBe("");
  });

  it("captures request-scoped chat failures and still appends an assistant error message", async () => {
    const onMessagesUpdate = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              error: "Search pipeline failed",
              requestId: "req-chat-456",
            })}\n`
          )
        );
        controller.close();
      },
    });

    global.fetch = vi.fn(async () => new Response(stream)) as typeof fetch;

    const { result } = renderHook(() =>
      useChatSession({
        ...defaultArgs,
        onMessagesUpdate,
      })
    );

    act(() => {
      result.current.setInput("What is in my data?");
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.chatError).toBe(
      "Search pipeline failed (request req-chat-456)"
    );
    expect(onMessagesUpdate).toHaveBeenCalledTimes(2);
    expect(onMessagesUpdate.mock.calls[1]?.[0].at(-1)).toMatchObject({
      role: "assistant",
      content: "Error: Search pipeline failed (request req-chat-456)",
      pipelineSteps: [],
    });
  });
});
