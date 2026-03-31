import { beforeEach, describe, expect, it, vi } from "vitest";

const parseDocumentUploadMock = vi.fn();
const streamDocumentIngestMock = vi.fn();

vi.mock("@/lib/ingest/service", () => ({
  parseDocumentUpload: parseDocumentUploadMock,
  streamDocumentIngest: streamDocumentIngestMock,
}));

describe("/api/ingest-document route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.HUGGINGFACE_API_KEY;
  });

  it("streams parsed document ingest output as ndjson", async () => {
    const formData = new FormData();
    formData.set("collection", "docs");

    parseDocumentUploadMock.mockResolvedValueOnce({
      collectionName: "docs",
      chunks: ["a"],
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
      sourceDocId: "doc-1",
      filename: "report.txt",
      fileType: "txt",
      metadata: {},
    });

    streamDocumentIngestMock.mockReturnValueOnce(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"type":"complete"}\n'));
          controller.close();
        },
      })
    );

    process.env.HUGGINGFACE_API_KEY = "hf-key";

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/ingest-document", {
      method: "POST",
    }) as NextRequestWithFormData;
    request.formData = vi.fn().mockResolvedValue(formData);

    const response = await POST(
      request
    );

    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
    expect(response.headers.get("X-Request-Id")).toEqual(expect.any(String));
    expect(await response.text()).toBe('{"type":"complete"}\n');
    expect(streamDocumentIngestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: "docs",
        hfKey: "hf-key",
      })
    );
  });

  it("returns a 400 JSON error when parsing the upload fails", async () => {
    parseDocumentUploadMock.mockRejectedValueOnce(new Error("No file provided"));

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/ingest-document", {
      method: "POST",
    }) as NextRequestWithFormData;
    request.formData = vi.fn().mockResolvedValue(new FormData());

    const response = await POST(
      request
    );

    const payload = (await response.json()) as Record<string, string>;
    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      error: "No file provided",
      requestId: expect.any(String),
    });
  });
});

type NextRequestWithFormData = Request & {
  formData: () => Promise<FormData>;
};
