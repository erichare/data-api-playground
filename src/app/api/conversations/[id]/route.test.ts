import { beforeEach, describe, expect, it, vi } from "vitest";

const renameRunMock = vi.fn();
const deleteRunMock = vi.fn();
const prepareMock = vi.fn((sql: string) => {
  if (sql.includes("UPDATE conversations")) {
    return { run: renameRunMock };
  }
  if (sql.includes("DELETE FROM conversations")) {
    return { run: deleteRunMock };
  }
  throw new Error(`Unexpected SQL in test: ${sql}`);
});

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    prepare: prepareMock,
  })),
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
    expect(renameRunMock).toHaveBeenCalledWith(
      "Research Notes",
      expect.any(String),
      "conv-1"
    );
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
    expect(deleteRunMock).toHaveBeenCalledWith("conv-1");
  });
});
