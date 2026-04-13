import { beforeEach, describe, expect, it, vi } from "vitest";

const renameConversationMock = vi.fn();
const deleteConversationMock = vi.fn();

vi.mock("@/lib/conversations/repository", () => ({
  renameConversation: renameConversationMock,
  deleteConversation: deleteConversationMock,
}));

describe("/api/conversations/[id] route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
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
