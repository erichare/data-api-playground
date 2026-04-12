import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation, Message } from "@/lib/types";
import {
  createConversationInApi,
  fetchCollectionsFromApi,
  fetchConversationsFromApi,
  getNextUntitledConversationName,
  isUntitledConversationName,
  makeBlankConversation,
  readApiErrorMessage,
  serializeMessage,
} from "./client";

function conversation(name: string): Conversation {
  const now = new Date("2026-03-30T12:00:00.000Z");
  return {
    id: name,
    name,
    messages: [],
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("playground client helpers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("picks the next untitled conversation suffix without reusing gaps incorrectly", () => {
    expect(getNextUntitledConversationName([])).toBe("Untitled");
    expect(
      getNextUntitledConversationName([conversation("Untitled")])
    ).toBe("Untitled (1)");
    expect(
      getNextUntitledConversationName([
        conversation("Untitled"),
        conversation("Untitled (2)"),
      ])
    ).toBe("Untitled (1)");
    expect(
      getNextUntitledConversationName([
        conversation("Untitled"),
        conversation("Untitled (1)"),
        conversation("Custom"),
      ])
    ).toBe("Untitled (2)");
  });

  it("recognizes untitled placeholder names", () => {
    expect(isUntitledConversationName("Untitled")).toBe(true);
    expect(isUntitledConversationName("Untitled (3)")).toBe(true);
    expect(isUntitledConversationName("Untitled draft")).toBe(false);
    expect(isUntitledConversationName("Custom")).toBe(false);
  });

  it("serializes search pipeline messages with compact search results", () => {
    const message: Message = {
      id: "m1",
      role: "assistant",
      content: "Done",
      timestamp: new Date("2026-03-30T12:34:56.000Z"),
      searchMode: "vector",
      latencyMs: 42,
      pipelineSteps: [
        {
          id: "search",
          status: "complete",
          data: {
            collection: "docs",
            command: "find({})",
            results: [{ _id: "1" }, { _id: "2" }],
          },
        },
      ],
      sources: [],
    };

    expect(serializeMessage(message)).toEqual({
      id: "m1",
      role: "assistant",
      content: "Done",
      timestamp: "2026-03-30T12:34:56.000Z",
      searchMode: "vector",
      latencyMs: 42,
      pipelineSteps: [
        {
          id: "search",
          status: "complete",
          data: {
            collection: "docs",
            command: "find({})",
            resultCount: 2,
          },
        },
      ],
      sources: [],
    });
  });

  it("creates a blank untitled conversation shell", () => {
    const result = makeBlankConversation();
    expect(result.name).toBe("Untitled");
    expect(result.messageCount).toBe(0);
    expect(result.messages).toEqual([]);
  });

  it("formats API errors with request ids and falls back when the response is not JSON", async () => {
    await expect(
      readApiErrorMessage(
        jsonResponse({ error: "Failed to save", requestId: "req-42" }, { status: 500 }),
        "Fallback"
      )
    ).resolves.toBe("Failed to save (request req-42)");

    await expect(
      readApiErrorMessage(new Response("not-json", { status: 500 }), "Fallback")
    ).resolves.toBe("Fallback");
  });

  it("fetches collections and surfaces a degraded keyspaces request without failing connect", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          collections: [
            {
              name: "movies",
              count: 8,
              vectorDim: 768,
            },
          ],
          fields: {
            movies: ["title", "genre"],
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { error: "Failed to list keyspaces", requestId: "req-keyspaces" },
          { status: 500 }
        )
      ) as typeof fetch;

    await expect(
      fetchCollectionsFromApi("token-123", "https://db.example.com", "analytics")
    ).resolves.toEqual({
      collections: [
        {
          name: "movies",
          count: 8,
          vectorDim: 768,
        },
      ],
      fields: {
        movies: ["title", "genre"],
      },
      keyspaces: [],
      keyspacesError: "Failed to list keyspaces (request req-keyspaces)",
    });

    expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "token-123",
        endpoint: "https://db.example.com",
        keyspace: "analytics",
      }),
    });
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/keyspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "token-123",
        endpoint: "https://db.example.com",
      }),
    });
  });

  it("surfaces collection fetch failures with request ids", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: "Connection failed",
            requestId: "req-connect",
          },
          { status: 401 }
        )
      ) as typeof fetch;

    await expect(
      fetchCollectionsFromApi("token-123", "https://db.example.com")
    ).rejects.toThrow("Connection failed (request req-connect)");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("maps remote conversation payloads into local conversation models", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        conversations: [
          {
            id: "conv-1",
            name: "Orders",
            createdAt: "2026-04-01T10:00:00.000Z",
            updatedAt: "2026-04-01T10:30:00.000Z",
            messageCount: 4,
          },
        ],
      })
    ) as typeof fetch;

    await expect(fetchConversationsFromApi()).resolves.toEqual([
      {
        id: "conv-1",
        name: "Orders",
        messages: [],
        createdAt: new Date("2026-04-01T10:00:00.000Z"),
        updatedAt: new Date("2026-04-01T10:30:00.000Z"),
        messageCount: 4,
      },
    ]);
  });

  it("surfaces conversation list failures instead of treating them as an empty state", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: "Conversations unavailable", requestId: "req-conversations" },
        { status: 503 }
      )
    ) as typeof fetch;

    await expect(fetchConversationsFromApi()).rejects.toThrow(
      "Conversations unavailable (request req-conversations)"
    );
  });

  it("creates conversations from the API response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        conversation: {
          id: "conv-9",
          name: "Research",
          createdAt: "2026-04-01T08:00:00.000Z",
          updatedAt: "2026-04-01T08:00:00.000Z",
          messageCount: 99,
        },
      })
    ) as typeof fetch;

    await expect(createConversationInApi("Research")).resolves.toEqual({
      id: "conv-9",
      name: "Research",
      messages: [],
      createdAt: new Date("2026-04-01T08:00:00.000Z"),
      updatedAt: new Date("2026-04-01T08:00:00.000Z"),
      messageCount: 0,
    });
  });

  it("uses the shared API error reader when conversation creation fails", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: "Unable to create conversation",
          requestId: "req-create",
        },
        { status: 500 }
      )
    ) as typeof fetch;

    await expect(createConversationInApi("Broken")).rejects.toThrow(
      "Unable to create conversation (request req-create)"
    );
  });
});
