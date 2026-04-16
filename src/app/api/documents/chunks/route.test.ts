import { beforeEach, describe, expect, it, vi } from "vitest";

const loadIngestedDocumentContentMock = vi.fn();
const resolveAstraConnectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  resolveAstraConnection: resolveAstraConnectionMock,
}));

vi.mock("@/lib/collections/service", () => ({
  loadIngestedDocumentContent: loadIngestedDocumentContentMock,
}));

describe("/api/documents/chunks route", () => {
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

  it("validates the required source document id and collection", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/documents/chunks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Validation failed",
      details: expect.any(Array),
    });
  });

  it("returns not_connected when Astra credentials are unavailable", async () => {
    resolveAstraConnectionMock.mockReturnValueOnce({
      token: "",
      endpoint: "",
      keyspace: "default_keyspace",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/documents/chunks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_doc_id: "doc-1",
          collection: "docs",
        }),
      }) as never
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "not_connected",
    });
  });

  it("loads and sorts document chunks by their metadata index", async () => {
    loadIngestedDocumentContentMock.mockResolvedValueOnce([
      { chunk_index: 1, content: "first chunk" },
      { chunk_index: 2, content: "second chunk" },
    ]);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/documents/chunks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_doc_id: "doc-1",
          collection: "docs",
        }),
      }) as never
    );

    expect(await response.json()).toEqual({
      chunks: [
        { chunk_index: 1, content: "first chunk" },
        { chunk_index: 2, content: "second chunk" },
      ],
    });
    expect(loadIngestedDocumentContentMock).toHaveBeenCalledWith({
      source_doc_id: "doc-1",
      collection: "docs",
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
    });
  });
});
