import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;
    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;
  });

  it("returns 401 when auth is enabled and no cookie is provided", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "test-password";
    process.env.PLAYGROUND_AUTH_SECRET = "test-secret-that-is-long-enough";

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/conversations/conv-1/messages"),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    expect(response.status).toBe(401);
  });

  it("returns 500 when listing messages throws", async () => {
    getConversationByIdMock.mockReturnValueOnce({ id: "conv-1" });
    listMessagesMock.mockImplementationOnce(() => { throw new Error("db error"); });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/conversations/conv-1/messages"),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    expect(response.status).toBe(500);
  });

  it("returns 500 when inserting a message throws", async () => {
    insertMessageMock.mockImplementationOnce(() => { throw new Error("db error"); });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations/conv-1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { id: "m1", role: "user", content: "hi", timestamp: "2026-01-01T00:00:00Z" },
        }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    expect(response.status).toBe(500);
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

  it("gracefully handles malformed JSON in pipeline_steps and sources", async () => {
    getConversationByIdMock.mockReturnValueOnce({ id: "conv-1" });
    listMessagesMock.mockReturnValueOnce([
      {
        id: "msg-1",
        conversation_id: "conv-1",
        role: "user",
        content: "hello",
        timestamp: "2026-03-30T12:00:00.000Z",
        search_mode: null,
        latency_ms: null,
        pipeline_steps: "not-valid-json",
        sources: "also-not-json",
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/conversations/conv-1/messages"),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    const body = await response.json();
    expect(body.messages[0].pipelineSteps).toBeUndefined();
    expect(body.messages[0].sources).toBeUndefined();
    expect(body.messages[0].searchMode).toBeUndefined();
    expect(body.messages[0].latencyMs).toBeUndefined();
  });

  it("handles messages with null pipeline_steps and sources", async () => {
    getConversationByIdMock.mockReturnValueOnce({ id: "conv-1" });
    listMessagesMock.mockReturnValueOnce([
      {
        id: "msg-1",
        conversation_id: "conv-1",
        role: "user",
        content: "hello",
        timestamp: "2026-03-30T12:00:00.000Z",
        search_mode: null,
        latency_ms: null,
        pipeline_steps: null,
        sources: null,
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/conversations/conv-1/messages"),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    const body = await response.json();
    expect(body.messages[0].pipelineSteps).toBeUndefined();
    expect(body.messages[0].sources).toBeUndefined();
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
