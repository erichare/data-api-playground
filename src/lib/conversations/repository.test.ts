import { beforeEach, describe, expect, it, vi } from "vitest";

const allMock = vi.fn();
const runMock = vi.fn();
const getMock = vi.fn();
const prepareMock = vi.fn(() => ({
  all: allMock,
  run: runMock,
  get: getMock,
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    prepare: prepareMock,
  })),
}));

import {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  getConversationById,
  listMessages,
  insertMessage,
  incrementMessageCount,
} from "./repository";

describe("conversations/repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listConversations", () => {
    it("queries conversations ordered by updated_at DESC", () => {
      const rows = [
        { id: "c1", name: "Test", created_at: "2026-01-01", updated_at: "2026-01-02", message_count: 3 },
      ];
      allMock.mockReturnValueOnce(rows);

      const result = listConversations();

      expect(prepareMock).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY updated_at DESC")
      );
      expect(result).toEqual(rows);
    });
  });

  describe("createConversation", () => {
    it("inserts a new conversation row with message_count 0", () => {
      createConversation({ id: "c1", name: "My Chat", now: "2026-01-01T00:00:00Z" });

      expect(prepareMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO conversations")
      );
      expect(runMock).toHaveBeenCalledWith("c1", "My Chat", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
    });
  });

  describe("renameConversation", () => {
    it("updates name and updated_at for the given ID", () => {
      renameConversation({ id: "c1", name: "Renamed", now: "2026-01-02T00:00:00Z" });

      expect(prepareMock).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE conversations SET name")
      );
      expect(runMock).toHaveBeenCalledWith("Renamed", "2026-01-02T00:00:00Z", "c1");
    });
  });

  describe("deleteConversation", () => {
    it("deletes by ID", () => {
      deleteConversation("c1");

      expect(prepareMock).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM conversations")
      );
      expect(runMock).toHaveBeenCalledWith("c1");
    });
  });

  describe("getConversationById", () => {
    it("returns the row when found", () => {
      getMock.mockReturnValueOnce({ id: "c1" });

      const result = getConversationById("c1");

      expect(result).toEqual({ id: "c1" });
      expect(prepareMock).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id FROM conversations WHERE id")
      );
    });

    it("returns undefined when not found", () => {
      getMock.mockReturnValueOnce(undefined);

      const result = getConversationById("missing");

      expect(result).toBeUndefined();
    });
  });

  describe("listMessages", () => {
    it("queries messages for a conversation ordered by timestamp ASC", () => {
      const rows = [{ id: "m1", conversation_id: "c1", role: "user", content: "hi", timestamp: "2026-01-01" }];
      allMock.mockReturnValueOnce(rows);

      const result = listMessages("c1");

      expect(prepareMock).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY timestamp ASC")
      );
      expect(result).toEqual(rows);
    });
  });

  describe("insertMessage", () => {
    it("returns the number of rows changed", () => {
      runMock.mockReturnValueOnce({ changes: 1 });

      const changes = insertMessage({
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "hello",
        timestamp: "2026-01-01T00:00:00Z",
        searchMode: null,
        latencyMs: null,
        pipelineSteps: null,
        sources: null,
      });

      expect(changes).toBe(1);
      expect(prepareMock).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT(id) DO NOTHING")
      );
    });

    it("returns 0 for duplicate IDs", () => {
      runMock.mockReturnValueOnce({ changes: 0 });

      const changes = insertMessage({
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "hello again",
        timestamp: "2026-01-01T00:00:01Z",
        searchMode: null,
        latencyMs: null,
        pipelineSteps: null,
        sources: null,
      });

      expect(changes).toBe(0);
    });
  });

  describe("incrementMessageCount", () => {
    it("bumps updated_at and message_count for the conversation", () => {
      incrementMessageCount({ conversationId: "c1", now: "2026-01-01T00:00:00Z" });

      expect(prepareMock).toHaveBeenCalledWith(
        expect.stringContaining("message_count = message_count + 1")
      );
      expect(runMock).toHaveBeenCalledWith("2026-01-01T00:00:00Z", "c1");
    });
  });
});
