import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteManyMock = vi.fn();
const collectionMock = vi.fn(() => ({
  deleteMany: deleteManyMock,
}));
const getAstraDbMock = vi.fn(() => ({
  collection: collectionMock,
}));
const resolveAstraConnectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
}));

describe("/api/delete-documents route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    resolveAstraConnectionMock.mockReturnValue({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
    });
  });

  it("returns a validation error when ids is empty", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/delete-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: "docs",
          ids: [],
        }),
      }) as never
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Validation failed");
    expect(json.details).toBeDefined();
  });

  it("returns an error when token or endpoint is missing", async () => {
    resolveAstraConnectionMock.mockReturnValueOnce({
      token: "",
      endpoint: "",
      keyspace: "default_keyspace",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/delete-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: "docs",
          ids: ["1"],
        }),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "token and endpoint are required",
    });
  });

  it("deletes the provided Astra documents and returns the delete count", async () => {
    deleteManyMock.mockResolvedValueOnce({ deletedCount: 2 });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/delete-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: "docs",
          ids: ["1", "2"],
        }),
      }) as never
    );

    expect(await response.json()).toEqual({ deletedCount: 2 });
    expect(deleteManyMock).toHaveBeenCalledWith({
      _id: { $in: ["1", "2"] },
    });
  });

  it("returns a 500 when the Astra delete operation fails", async () => {
    deleteManyMock.mockRejectedValueOnce(new Error("Astra unavailable"));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/delete-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: "docs",
          ids: ["1"],
        }),
      }) as never
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Astra unavailable",
    });
  });
});
