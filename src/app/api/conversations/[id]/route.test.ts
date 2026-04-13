import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renameConversationMock = vi.fn();
const deleteConversationMock = vi.fn();

vi.mock("@/lib/conversations/repository", () => ({
  renameConversation: renameConversationMock,
  deleteConversation: deleteConversationMock,
}));

describe("/api/conversations/[id] route", () => {
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

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/conversations/conv-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    expect(response.status).toBe(401);
  });

  it("returns 500 when renaming throws", async () => {
    renameConversationMock.mockImplementationOnce(() => { throw new Error("db error"); });

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/conversations/conv-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    expect(response.status).toBe(500);
  });

  it("returns 500 when deleting throws", async () => {
    deleteConversationMock.mockImplementationOnce(() => { throw new Error("db error"); });

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/conversations/conv-1", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    expect(response.status).toBe(500);
  });

  it("renames a conversation", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/conversations/conv-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Research Notes" }),
      }),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    expect(await response.json()).toEqual({ updated: true });
    expect(renameConversationMock).toHaveBeenCalledWith({
      id: "conv-1",
      name: "Research Notes",
      now: expect.any(String),
    });
  });

  it("deletes a conversation by id", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/conversations/conv-1", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "conv-1" }) }
    );

    expect(await response.json()).toEqual({ deleted: true });
    expect(deleteConversationMock).toHaveBeenCalledWith("conv-1");
  });
});
