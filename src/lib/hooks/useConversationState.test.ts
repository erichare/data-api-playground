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

  it("creates an initial conversation when the server has none and recreates one after deleting the last conversation", async () => {
    let conversationCreateCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/conversations" && (!init || init.method === undefined)) {
        return {
          ok: true,
          json: async () => ({ conversations: [] }),
        } as Response;
      }

      if (url === "/api/conversations" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { name?: string };
        conversationCreateCount += 1;

        if (body.name === "Untitled" && conversationCreateCount === 1) {
          return {
            ok: true,
            json: async () => ({
              conversation: {
                id: "conv-initial",
                name: "Untitled",
                createdAt: "2026-03-30T12:00:00.000Z",
                updatedAt: "2026-03-30T12:00:00.000Z",
                messageCount: 0,
              },
            }),
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({
            conversation: {
              id: "conv-replacement",
              name: "Untitled",
              createdAt: "2026-03-30T12:05:00.000Z",
              updatedAt: "2026-03-30T12:05:00.000Z",
              messageCount: 0,
            },
          }),
        } as Response;
      }

      if (url === "/api/conversations/conv-initial" && init?.method === "DELETE") {
        return { ok: true, json: async () => ({}) } as Response;
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useConversationState({
        huggingfaceApiKey: "",
      })
    );

    await act(async () => {
      await result.current.bootstrapConversations();
    });

    expect(result.current.activeConversationId).toBe("conv-initial");

    await act(async () => {
      await result.current.handleDeleteConversation("conv-initial");
    });

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv-replacement");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/conv-initial",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("loads conversation messages once per conversation and activates the chat view on changes", async () => {
    const onConversationActivated = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/conversations" && (!init || init.method === undefined)) {
        return {
          ok: true,
          json: async () => ({
            conversations: [
              {
                id: "conv-1",
                name: "First",
                createdAt: "2026-03-30T12:00:00.000Z",
                updatedAt: "2026-03-30T12:00:00.000Z",
                messageCount: 1,
              },
              {
                id: "conv-2",
                name: "Second",
                createdAt: "2026-03-30T13:00:00.000Z",
                updatedAt: "2026-03-30T13:00:00.000Z",
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

      if (url === "/api/conversations/conv-2/messages") {
        return {
          ok: true,
          json: async () => ({
            messages: [
              {
                id: "m2",
                role: "assistant",
                content: "hi there",
                timestamp: "2026-03-30T13:00:00.000Z",
              },
            ],
          }),
        } as Response;
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useConversationState({
        huggingfaceApiKey: "",
        onConversationActivated,
      })
    );

    await act(async () => {
      await result.current.bootstrapConversations();
    });

    await act(async () => {
      await result.current.handleConversationChange("conv-2");
      await result.current.handleConversationChange("conv-2");
    });

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv-2");
      expect(result.current.messages[0]?.content).toBe("hi there");
    });

    expect(onConversationActivated).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url) === "/api/conversations/conv-2/messages")
    ).toHaveLength(1);
  });
});
