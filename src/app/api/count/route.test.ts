import { beforeEach, describe, expect, it, vi } from "vitest";

const estimatedDocumentCountMock = vi.fn();
const collectionMock = vi.fn(() => ({
  estimatedDocumentCount: estimatedDocumentCountMock,
}));
const getAstraDbMock = vi.fn(() => ({
  collection: collectionMock,
}));
const resolveAstraConnectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
}));

describe("/api/count route", () => {
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

  it("validates the required Astra connection and collection", async () => {
    resolveAstraConnectionMock.mockReturnValueOnce({
      token: "",
      endpoint: "",
      keyspace: "default_keyspace",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: "" }),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "token, endpoint, and collection are required",
    });
  });

  it("returns the estimated collection count", async () => {
    estimatedDocumentCountMock.mockResolvedValueOnce(42);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: "docs" }),
      }) as never
    );

    expect(await response.json()).toEqual({ count: 42 });
    expect(collectionMock).toHaveBeenCalledWith("docs");
  });

  it("returns a 500 when counting fails", async () => {
    estimatedDocumentCountMock.mockRejectedValueOnce(new Error("count failed"));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: "docs" }),
      }) as never
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "count failed",
    });
  });
});
