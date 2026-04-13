import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listConversationsMock = vi.fn();
const createConversationMock = vi.fn();

vi.mock("@/lib/conversations/repository", () => ({
  listConversations: listConversationsMock,
  createConversation: createConversationMock,
}));

describe("/api/conversations route", () => {
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
    const response = await GET(new Request("http://localhost/api/conversations"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "Authentication required" });
  });

  it("returns 500 when listing conversations throws", async () => {
    listConversationsMock.mockImplementationOnce(() => { throw new Error("db error"); });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/conversations"));

    expect(response.status).toBe(500);
  });

  it("returns 500 when creating a conversation throws", async () => {
    createConversationMock.mockImplementationOnce(() => { throw new Error("db error"); });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      })
    );

    expect(response.status).toBe(500);
  });

  it("returns conversation rows from sqlite in API shape", async () => {
    listConversationsMock.mockReturnValueOnce([
      {
        id: "conv-1",
        name: "Untitled",
        created_at: "2026-03-30T12:00:00.000Z",
        updated_at: "2026-03-30T13:00:00.000Z",
        message_count: 2,
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/conversations"));

    expect(await response.json()).toEqual({
      conversations: [
        {
          id: "conv-1",
          name: "Untitled",
          createdAt: "2026-03-30T12:00:00.000Z",
          updatedAt: "2026-03-30T13:00:00.000Z",
          messageCount: 2,
        },
      ],
    });
  });

  it("creates a conversation row and returns the inserted metadata", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Research Notes" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(body.conversation.name).toBe("Research Notes");
    expect(body.conversation.messageCount).toBe(0);
    expect(createConversationMock).toHaveBeenCalledWith({
      id: expect.any(String),
      name: "Research Notes",
      now: expect.any(String),
    });
  });
});
