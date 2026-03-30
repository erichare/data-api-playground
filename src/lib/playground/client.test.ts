import { describe, expect, it } from "vitest";
import type { Conversation, Message } from "@/lib/types";
import {
  getNextUntitledConversationName,
  isUntitledConversationName,
  makeBlankConversation,
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

describe("playground client helpers", () => {
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
});
