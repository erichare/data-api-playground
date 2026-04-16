import { beforeEach, describe, expect, it, vi } from "vitest";

const listIngestedDocumentsMock = vi.fn();
const deleteIngestedDocumentMock = vi.fn();

vi.mock("@/lib/collections/service", () => ({
  listIngestedDocuments: listIngestedDocumentsMock,
  deleteIngestedDocument: deleteIngestedDocumentMock,
}));

describe("/api/documents route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
  });

  it("returns 401 on GET when auth is enabled and no cookie is provided", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "test-password";
    process.env.PLAYGROUND_AUTH_SECRET = "test-secret-that-is-long-enough";

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/documents?collection=docs") as never
    );

    expect(response.status).toBe(401);
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
  });

  it("returns 500 when listing documents throws", async () => {
    listIngestedDocumentsMock.mockImplementationOnce(() => { throw new Error("db error"); });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/documents?collection=docs") as never
    );

    expect(response.status).toBe(500);
  });

  it("lists ingested documents for the requested collection", async () => {
    listIngestedDocumentsMock.mockReturnValueOnce([
      {
        source_doc_id: "doc-1",
        source_filename: "report.pdf",
        file_type: "pdf",
        file_size: 512,
        content_hash: "abc123",
        chunk_total: 3,
        collection: "docs",
        ingested_at: "2026-03-30T12:00:00.000Z",
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/documents?collection=docs") as never
    );

    expect(await response.json()).toEqual({
      documents: [
        {
          source_doc_id: "doc-1",
          source_filename: "report.pdf",
          file_type: "pdf",
          file_size: 512,
          content_hash: "abc123",
          chunk_total: 3,
          collection: "docs",
          ingested_at: "2026-03-30T12:00:00.000Z",
        },
      ],
    });
    expect(listIngestedDocumentsMock).toHaveBeenCalledWith({
      collection: "docs",
      backendKind: undefined,
      backendScope: undefined,
    });
    expect(response.headers.get("X-Request-Id")).toEqual(expect.any(String));
  });

  it("deletes an ingested document through the collection service", async () => {
    deleteIngestedDocumentMock.mockResolvedValueOnce({ ok: true });

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_doc_id: "doc-1",
          collection: "docs",
          token: "AstraCS:secret",
          endpoint: "https://db.apps.astra.datastax.com",
        }),
      }) as never
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(deleteIngestedDocumentMock).toHaveBeenCalledWith({
      source_doc_id: "doc-1",
      collection: "docs",
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
    });
    expect(response.headers.get("X-Request-Id")).toEqual(expect.any(String));
  });

  it("returns a 500 response when document deletion fails", async () => {
    deleteIngestedDocumentMock.mockRejectedValueOnce(new Error("Delete failed"));

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_doc_id: "doc-1",
          collection: "docs",
        }),
      }) as never
    );

    const payload = (await response.json()) as Record<string, string>;

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      error: "Delete failed",
      requestId: expect.any(String),
    });
  });
});
