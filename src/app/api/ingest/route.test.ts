import { beforeEach, describe, expect, it, vi } from "vitest";

const streamCsvIngestMock = vi.fn();

vi.mock("@/lib/ingest/service", () => ({
  streamCsvIngest: streamCsvIngestMock,
}));

describe("/api/ingest route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("delegates ingest streaming to the ingest service", async () => {
    const encoder = new TextEncoder();
    streamCsvIngestMock.mockReturnValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "complete", processed: 2 }) + "\n")
          );
          controller.close();
        },
      })
    );

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        collection: "docs",
        filename: "rows.csv",
        rows: [{ title: "A" }, { title: "B" }],
      }),
    });

    const response = await POST(request as never);

    expect(streamCsvIngestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "docs",
        filename: "rows.csv",
      })
    );
    expect(await response.text()).toContain('"type":"complete"');
  });
});
