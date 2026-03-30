import { beforeEach, describe, expect, it, vi } from "vitest";

const createCollectionMock = vi.fn();
const dropCollectionMock = vi.fn();
const getAstraDbMock = vi.fn(() => ({
  createCollection: createCollectionMock,
  dropCollection: dropCollectionMock,
}));
const resolveAstraConnectionMock = vi.fn();
const prepareMock = vi.fn();
const getDbMock = vi.fn(() => ({
  prepare: prepareMock,
}));

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
}));

vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

describe("collection service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a vectorize collection through Astra and returns UI metadata", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });

    const { createCollectionInAstra } = await import("./service");
    await expect(
      createCollectionInAstra({
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        name: "docs",
        dimension: 1024,
        metric: "cosine",
        provider: "nvidia",
        model: "NV-Embed-QA",
      })
    ).resolves.toEqual({
      name: "docs",
      count: 0,
      vectorDim: 1024,
      vectorizeService: {
        provider: "nvidia",
        modelName: "NV-Embed-QA",
      },
    });

    expect(createCollectionMock).toHaveBeenCalledWith("docs", {
      vector: {
        dimension: 1024,
        metric: "cosine",
        service: {
          provider: "nvidia",
          modelName: "NV-Embed-QA",
        },
      },
    });
  });

  it("lists ingested document summaries from sqlite rows", async () => {
    prepareMock.mockReturnValueOnce({
      all: () => [
        {
          source_doc_id: "doc-1",
          source_filename: "report.pdf",
          file_type: "pdf",
          file_size: 5120,
          md5_hash: "abc",
          chunk_total: 3,
          collection: "docs",
          ingested_at: "2026-03-30T10:00:00.000Z",
        },
      ],
    });

    const { listIngestedDocuments } = await import("./service");
    expect(listIngestedDocuments("docs")).toEqual([
      {
        source_doc_id: "doc-1",
        source_filename: "report.pdf",
        file_type: "pdf",
        file_size: 5120,
        md5_hash: "abc",
        chunk_total: 3,
        collection: "docs",
        ingested_at: "2026-03-30T10:00:00.000Z",
      },
    ]);
  });
});
