import { beforeEach, describe, expect, it, vi } from "vitest";

const insertManyMock = vi.fn();
const listCollectionsMock = vi.fn();
const getAstraDbMock = vi.fn(() => ({
  collection: vi.fn(() => ({
    insertMany: insertManyMock,
  })),
  listCollections: listCollectionsMock,
}));
const resolveAstraConnectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
}));

describe("ingest service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chunks long text into multiple ingest slices", async () => {
    const { chunkText } = await import("./service");
    const chunks = chunkText(
      "A".repeat(900) + "\n\n" + "B".repeat(900),
      1000,
      100
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.length).toBeLessThanOrEqual(1000);
  });

  it("streams vectorize csv ingest progress through Astra", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });
    listCollectionsMock.mockResolvedValue([
      {
        name: "docs",
        definition: { vector: { service: { provider: "nvidia" } } },
      },
    ]);

    const { streamCsvIngest } = await import("./service");
    const response = new Response(
      streamCsvIngest({
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        collection: "docs",
        filename: "rows.csv",
        rows: [
          { title: "First row", category: "a" },
          { title: "Second row", category: "b" },
        ],
      })
    );

    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events[0]).toMatchObject({
      type: "start",
      total: 2,
      collection: "docs",
      useVectorize: true,
    });
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      processed: 2,
      total: 2,
    });
    expect(insertManyMock).toHaveBeenCalledWith([
      expect.objectContaining({
        title: "First row",
        category: "a",
        $vectorize: "title: First row; category: a",
      }),
      expect.objectContaining({
        title: "Second row",
        category: "b",
        $vectorize: "title: Second row; category: b",
      }),
    ]);
  });
});
