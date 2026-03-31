import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchNextPageMock = vi.fn();
const initialPageStateMock = vi.fn();
const findMock = vi.fn(() => ({
  fetchNextPage: fetchNextPageMock,
  initialPageState: initialPageStateMock,
}));
const collectionMock = vi.fn(() => ({
  find: findMock,
}));
const getAstraDbMock = vi.fn(() => ({
  collection: collectionMock,
}));
const resolveAstraConnectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
}));

describe("/api/browse route", () => {
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
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: "" }),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Validation failed",
      details: [{ path: "collection", message: "Too small: expected string to have >=1 characters" }],
    });
  });

  it("browses a collection, masks vectors, and preserves the next page state", async () => {
    const cursor = {
      fetchNextPage: fetchNextPageMock,
      initialPageState: initialPageStateMock,
    };
    findMock.mockReturnValueOnce(cursor);
    initialPageStateMock.mockReturnValueOnce(cursor);
    fetchNextPageMock.mockResolvedValueOnce({
      result: [
        { _id: "1", title: "Doc 1", $vector: [0.1, 0.2, 0.3] },
        { _id: "2", title: "Doc 2" },
      ],
      nextPageState: "next-page",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: "docs",
          pageState: "current-page",
          sort: { col: "title", dir: 1 },
        }),
      }) as never
    );

    expect(findMock).toHaveBeenCalledWith(
      {},
      { limit: 20, sort: { title: 1 } }
    );
    expect(initialPageStateMock).toHaveBeenCalledWith("current-page");
    expect(await response.json()).toEqual({
      documents: [
        { _id: "1", title: "Doc 1", $vector: "__vector_3__" },
        { _id: "2", title: "Doc 2" },
      ],
      nextPageState: "next-page",
    });
  });

  it("returns a 400 when browsing fails", async () => {
    fetchNextPageMock.mockRejectedValueOnce(new Error("browse failed"));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: "docs" }),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "browse failed",
    });
  });
});
