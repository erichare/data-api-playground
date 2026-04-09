// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConversationState } from "./useConversationState";

describe("useConversationState", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("bootstraps existing conversations and loads messages for the first one", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/conversations" && (!init || init.method === undefined)) {
        return {
          ok: true,
          json: async () => ({
            conversations: [
              {
                id: "conv-1",
                name: "Untitled",
                createdAt: "2026-03-30T12:00:00.000Z",
                updatedAt: "2026-03-30T12:00:00.000Z",
                messageCount: 1,
              },
            ],
          }),
        } as Response;
      }

      if (url === "/api/conversations/conv-1/messages") {
        return {
          ok: true,
          json: async () => ({
            messages: [
              {
                id: "m1",
                role: "user",
                content: "hello",
                timestamp: "2026-03-30T12:00:00.000Z",
              },
            ],
          }),
        } as Response;
      }

      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useConversationState({
        huggingfaceApiKey: "",
      })
    );

    await act(async () => {
      await result.current.bootstrapConversations();
    });

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv-1");
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]?.content).toBe("hello");
    });
  });

  it("persists new messages and auto-titles an untitled conversation after the first user message", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/conversations" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            conversation: {
              id: "conv-new",
              name: "Untitled",
              createdAt: "2026-03-30T12:00:00.000Z",
              updatedAt: "2026-03-30T12:00:00.000Z",
              messageCount: 0,
            },
          }),
        } as Response;
      }

      if (url === "/api/conversations/conv-new/messages" && init?.method === "POST") {
        return { ok: true, json: async () => ({}) } as Response;
      }

      if (url === "/api/conversations/title" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ title: "Customer Support Notes" }),
        } as Response;
      }

      if (url === "/api/conversations/conv-new" && init?.method === "PATCH") {
        return { ok: true, json: async () => ({}) } as Response;
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useConversationState({
        huggingfaceApiKey: "hf-key",
      })
    );

    await act(async () => {
      await result.current.handleNewConversation();
    });

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv-new");
    });

    act(() => {
      result.current.handleMessagesUpdate([
        {
          id: "msg-1",
          role: "user",
          content: "Please summarize my customer feedback trends",
          timestamp: new Date("2026-03-30T12:01:00.000Z"),
        },
      ]);
    });

    await waitFor(() => {
      expect(
        result.current.conversations.find((c) => c.id === "conv-new")?.name
      ).toBe("Customer Support Notes");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/conv-new/messages",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/title",
      expect.objectContaining({ method: "POST" })
    );
  });
});
