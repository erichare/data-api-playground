import { beforeEach, describe, expect, it, vi } from "vitest";

const getConversationByIdMock = vi.fn();
const listMessagesMock = vi.fn();
const insertMessageMock = vi.fn();
const incrementMessageCountMock = vi.fn();

vi.mock("@/lib/conversations/repository", () => ({
  getConversationById: getConversationByIdMock,
  listMessages: listMessagesMock,
  insertMessage: insertMessageMock,
  incrementMessageCount: incrementMessageCountMock,
}));

describe("/api/conversations/[id]/messages route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
  });

  it("returns 404 when the conversation does not exist", async () => {
    getConversationByIdMock.mockReturnValueOnce(undefined);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/conversations/nonexistent/messages"),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Conversation not found" });
  });

  it("returns stored messages with parsed pipeline metadata", async () => {
    getConversationByIdMock.mockReturnValueOnce({ id: "conv-1" });
    listMessagesMock.mockReturnValueOnce([
      {
        id: "msg-1",
        conversation_id: "conv-1",
        role: "assistant",
        content: "Here is the answer",
        timestamp: "2026-03-30T12:00:00.000Z",
        search_mode: "hybrid",
        latency_ms: 42,
        pipeline_steps: JSON.stringify([{ id: "search", status: "complete" }]),
        sources: JSON.stringify([{ title: "Doc 1" }]),
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/conversations/conv-1/messages"),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    expect(await response.json()).toEqual({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          content: "Here is the answer",
          timestamp: "2026-03-30T12:00:00.000Z",
          searchMode: "hybrid",
          latencyMs: 42,
          pipelineSteps: [{ id: "search", status: "complete" }],
          sources: [{ title: "Doc 1" }],
        },
      ],
    });
  });

  it("increments the conversation count only when a new message row is inserted", async () => {
    insertMessageMock.mockReturnValueOnce(1);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations/conv-1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "msg-1",
            role: "user",
            content: "hello",
            timestamp: "2026-03-30T12:00:00.000Z",
          },
        }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    expect(await response.json()).toEqual({ saved: true });
    expect(insertMessageMock).toHaveBeenCalledTimes(1);
    expect(incrementMessageCountMock).toHaveBeenCalledTimes(1);
    expect(incrementMessageCountMock).toHaveBeenCalledWith({
      conversationId: "conv-1",
      now: expect.any(String),
    });
  });

  it("does not inflate message_count when the same message id is retried", async () => {
    insertMessageMock.mockReturnValueOnce(0);

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/conversations/conv-1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "msg-1",
            role: "user",
            content: "hello again",
            timestamp: "2026-03-30T12:00:01.000Z",
          },
        }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    expect(insertMessageMock).toHaveBeenCalledTimes(1);
    expect(incrementMessageCountMock).not.toHaveBeenCalled();
  });
});
