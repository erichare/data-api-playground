import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const streamCsvIngestMock = vi.fn();

vi.mock("@/lib/ingest/service", () => ({
  streamCsvIngest: streamCsvIngestMock,
}));

describe("/api/ingest route", () => {
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

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: "docs", rows: [{ a: "1" }], filename: "test.csv" }),
      }) as never
    );

    expect(response.status).toBe(401);
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
