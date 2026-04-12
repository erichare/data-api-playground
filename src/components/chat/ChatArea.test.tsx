// @vitest-environment jsdom

import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatArea } from "./ChatArea";

vi.mock("framer-motion", () => {
  const cleanProps = (props: Record<string, unknown>) => {
    const {
      initial,
      animate,
      exit,
      transition,
      whileHover,
      whileTap,
      ...rest
    } = props;

    void initial;
    void animate;
    void exit;
    void transition;
    void whileHover;
    void whileTap;
    return rest;
  };

  return {
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...cleanProps(props)}>{children}</div>
      ),
      button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...cleanProps(props)}>{children}</button>
      ),
      span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
        <span {...cleanProps(props)}>{children}</span>
      ),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock("./MessageBubble", () => ({
  MessageBubble: ({ message }: { message: { content: string } }) => (
    <div data-testid="message-bubble">{message.content}</div>
  ),
}));

vi.mock("./PipelineTrace", () => ({
  PipelineTrace: ({ steps }: { steps: Array<{ id: string }> }) => (
    <div data-testid="pipeline-trace">{steps.map((step) => step.id).join(",")}</div>
  ),
}));

vi.mock("./SearchModeToggle", () => ({
  SearchModeToggle: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: "vector" | "hybrid" | "lexical") => void;
  }) => (
    <div>
      <span data-testid="search-mode-value">{value}</span>
      <button onClick={() => onChange("lexical")}>Lexical</button>
    </div>
  ),
}));

function makeChatProps(overrides: Partial<Parameters<typeof ChatArea>[0]> = {}) {
  return {
    conversations: [
      {
        id: "conv-1",
        name: "Conversation One",
        messages: [],
        createdAt: new Date("2026-03-30T12:00:00.000Z"),
        updatedAt: new Date("2026-03-30T12:00:00.000Z"),
        messageCount: 0,
      },
    ],
    activeConversationId: "conv-1",
    messages: [],
    onMessagesUpdate: vi.fn(),
    astraToken: "AstraCS:secret",
    astraEndpoint: "https://db.apps.astra.datastax.com",
    keyspace: "default_keyspace",
    collections: [{ name: "orders", isVectorize: false, vectorDimension: 768 }],
    activeCollection: "orders",
    huggingfaceApiKey: "hf-key",
    collectionFields: { orders: ["total_spend", "status"] },
    initializing: false,
    ...overrides,
  };
}

describe("ChatArea", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it("fills the input when a suggested query is clicked", () => {
    render(<ChatArea {...makeChatProps()} />);

    fireEvent.click(screen.getByText("What are the top 5 records by total_spend?"));

    expect((screen.getByTestId("chat-input") as HTMLTextAreaElement).value).toBe(
      "What are the top 5 records by total_spend?"
    );
  });

  it("does not show demo mode copy when the app is connected via env-backed Astra credentials", () => {
    render(
      <ChatArea
        {...makeChatProps({
          astraToken: "",
          isConnected: true,
        })}
      />
    );

    expect(
      screen.queryByText("Demo mode — connect to Astra DB to query real data")
    ).toBeNull();
  });

  it("streams chat events into a final assistant message with sources and pipeline steps", async () => {
    const onMessagesUpdate = vi.fn();
    const props = makeChatProps({
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
    });

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
            `${JSON.stringify({
              step: "respond",
              status: "complete",
              latencyMs: 11,
              data: { content: "Use the lexical results." },
            })}\n`
          )
        );
        controller.close();
      },
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/chat");
      const body = JSON.parse(String(init?.body)) as {
        searchMode: string;
        history: Array<{ role: string; content: string }>;
      };

      expect(body.searchMode).toBe("lexical");
      expect(body.history[0]?.content).toContain("[Search results shown to user:]");

      return new Response(stream);
    }) as typeof fetch;

    render(<ChatArea {...props} />);

    fireEvent.click(screen.getByText("Lexical"));
    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Find active orders" },
    });
    fireEvent.click(screen.getByTestId("chat-send-button"));

    await waitFor(() => {
      expect(onMessagesUpdate).toHaveBeenCalledTimes(2);
    });

    const firstUpdate = onMessagesUpdate.mock.calls[0]?.[0] as Array<{ role: string; content: string }>;
    expect(firstUpdate.at(-1)).toMatchObject({
      role: "user",
      content: "Find active orders",
    });

    const secondUpdate = onMessagesUpdate.mock.calls[1]?.[0] as Array<{
      role: string;
      content: string;
      searchMode?: string;
      latencyMs?: number;
      sources?: unknown[];
      pipelineSteps?: Array<{ id: string; status: string }>;
    }>;
    expect(secondUpdate).toHaveLength(3);
    expect(secondUpdate.at(-1)).toMatchObject({
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
    });
    expect(secondUpdate.at(-1)?.pipelineSteps).toEqual([
      expect.objectContaining({ id: "analyze", status: "complete" }),
      expect.objectContaining({ id: "search", status: "complete" }),
      expect.objectContaining({ id: "respond", status: "complete" }),
    ]);
  });

  it("renders a live assistant bubble while the response is streaming", async () => {
    const props = makeChatProps();
    const encoder = new TextEncoder();
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller;
      },
    });

    global.fetch = vi.fn(async () => new Response(stream)) as typeof fetch;

    function StatefulChatArea() {
      const [messages, setMessages] = useState(props.messages);

      return (
        <ChatArea
          {...props}
          messages={messages}
          onMessagesUpdate={setMessages}
        />
      );
    }

    render(<StatefulChatArea />);

    fireEvent.change(screen.getByTestId("chat-input"), {
      target: { value: "Stream something" },
    });
    fireEvent.click(screen.getByTestId("chat-send-button"));

    act(() => {
      controllerRef?.enqueue(
        encoder.encode(
          `${JSON.stringify({
            step: "respond",
            status: "running",
            data: { delta: "Hello", content: "Hello" },
          })}\n`
        )
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeTruthy();
    });

    act(() => {
      controllerRef?.enqueue(
        encoder.encode(
          `${JSON.stringify({
            step: "respond",
            status: "complete",
            latencyMs: 3,
            data: { content: "Hello" },
          })}\n`
        )
      );
      controllerRef?.close();
    });
  });
});
