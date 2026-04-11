import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedAiBackend } from "@/lib/ai/service";

const getAstraDbMock = vi.fn();
const embedManyMock = vi.fn();
const recordAstraClientCallMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  SYSTEM_FIELDS: new Set(["_id", "$vector"]),
}));

vi.mock("@/lib/ai/service", () => ({
  embedMany: embedManyMock,
}));

vi.mock("@/lib/astraClientLog", () => ({
  recordAstraClientCall: recordAstraClientCallMock,
}));

const huggingFaceBackend: ResolvedAiBackend = {
  provider: "huggingface",
  source: "manual",
  huggingfaceApiKey: "hf-key",
  huggingFaceKeyPresent: true,
  chatModel: "ibm-granite/granite-3.3-8b-instruct",
  embedModel: "ibm-granite/granite-embedding-125m-english",
  ollamaBaseUrl: "http://127.0.0.1:11434",
};

describe("chat search helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a compact document preview and skips system fields", async () => {
    const { docPreview } = await import("./search");

    expect(
      docPreview({
        _id: "1",
        title: "Quarterly Report",
        score: 98,
        featured: true,
        owner: "team-a",
        note: "latest",
        $vector: [0.1, 0.2],
      })
    ).toEqual({
      title: "Quarterly Report",
      score: 98,
      featured: "true",
      owner: "team-a",
    });
  });

  it("embeds a query through the resolved backend", async () => {
    embedManyMock.mockResolvedValueOnce({
      embeddings: [[0.11111, 0.22222, 0.33333]],
      provider: "huggingface",
      model: huggingFaceBackend.embedModel,
    });

    const { embedQuery } = await import("./search");
    const result = await embedQuery({
      backend: huggingFaceBackend,
      query: "find the best customer",
      isVectorize: false,
    });

    expect(result.realEmbedding).toBe(true);
    expect(result.embeddingVector).toEqual([0.11111, 0.22222, 0.33333]);
    expect(result.vectorPreview).toEqual([0.1111, 0.2222, 0.3333]);
    expect(result.provider).toBe("huggingface");
    expect(result.model).toBe(huggingFaceBackend.embedModel);
  });

  it("marks vectorize collections as Astra server-side embeddings", async () => {
    const { embedQuery } = await import("./search");
    const result = await embedQuery({
      backend: huggingFaceBackend,
      query: "find the best customer",
      isVectorize: true,
    });

    expect(result).toEqual({
      embeddingVector: [],
      vectorPreview: [],
      realEmbedding: true,
      provider: "astra",
      model: "server-side vectorize",
    });
    expect(embedManyMock).not.toHaveBeenCalled();
  });

  it("rejects empty embeddings returned by the active provider", async () => {
    embedManyMock.mockResolvedValueOnce({
      embeddings: [[]],
      provider: "huggingface",
      model: huggingFaceBackend.embedModel,
    });

    const { embedQuery } = await import("./search");

    await expect(
      embedQuery({
        backend: huggingFaceBackend,
        query: "find the best customer",
        isVectorize: false,
      })
    ).rejects.toThrow("huggingface returned an empty embedding");
  });

  it("validates embedding dimensions before searching non-vectorize collections", async () => {
    getAstraDbMock.mockReturnValue({
      collection: vi.fn(() => ({
        find: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const { searchCollections } = await import("./search");

    await expect(
      searchCollections({
        token: "AstraCS:secret",
        endpoint: "https://db.apps.astra.datastax.com",
        keyspace: "default_keyspace",
        isConnected: true,
        query: "show active records",
        collection: "orders",
        collections: [
          { name: "orders", isVectorize: false, vectorDimension: 768 },
        ],
        collectionsToSearch: [
          { name: "orders", isVec: false, vectorDimension: 768 },
        ],
        userCollections: ["orders"],
        searchMode: "vector",
        sortField: null,
        sortDir: "desc",
        limit: 5,
        filterField: null,
        filterOp: null,
        filterValue: null,
        embeddingVector: [0.1, 0.2, 0.3],
      })
    ).rejects.toThrow(
      'Embedding dimension mismatch for "orders": collection expects 768d but active model returned 3d'
    );
  });

  it("returns an empty offline search result with a preview command when disconnected", async () => {
    vi.useFakeTimers();

    const { searchCollections } = await import("./search");
    const pending = searchCollections({
      isConnected: false,
      query: "show active records",
      collection: "orders",
      collections: [{ name: "orders", isVectorize: false, vectorDimension: 3 }],
      collectionsToSearch: [{ name: "orders", isVec: false, vectorDimension: 3 }],
      userCollections: ["orders"],
      searchMode: "vector",
      sortField: null,
      sortDir: "desc",
      limit: 5,
      filterField: null,
      filterOp: null,
      filterValue: null,
      embeddingVector: [0.1, 0.2, 0.3],
    });

    await vi.advanceTimersByTimeAsync(80);
    await expect(pending).resolves.toMatchObject({
      searchResults: [],
      collection: "orders",
      commandStr: expect.stringContaining('db.collection("orders")'),
    });

    vi.useRealTimers();
  });

  it("sorts by a requested scalar field when present", async () => {
    const findToArrayMock = vi.fn().mockResolvedValue([
      { _id: "doc-1", title: "Quarterly Report", score: 98 },
    ]);
    const findMock = vi.fn(() => ({
      toArray: findToArrayMock,
    }));
    getAstraDbMock.mockReturnValue({
      collection: vi.fn(() => ({
        find: findMock,
      })),
    });

    const { searchCollections } = await import("./search");
    const result = await searchCollections({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
      isConnected: true,
      query: "show top scores",
      collection: "orders",
      collections: [{ name: "orders", isVectorize: false, vectorDimension: null }],
      collectionsToSearch: [{ name: "orders", isVec: false, vectorDimension: null }],
      userCollections: ["orders"],
      searchMode: "vector",
      sortField: "score",
      sortDir: "asc",
      limit: 3,
      filterField: "topic",
      filterOp: "$eq",
      filterValue: "finance",
      embeddingVector: [0.1, 0.2, 0.3],
    });

    expect(findMock).toHaveBeenCalledWith(
      { topic: "finance" },
      { sort: { score: 1 }, limit: 3 }
    );
    expect(result).toMatchObject({
      collection: "orders",
      commandStr: expect.stringContaining("sort: { score: 1 }"),
      searchResults: [
        {
          id: "doc-1",
          similarity: 1,
          preview: { title: "Quarterly Report", score: 98 },
          collection: "orders",
        },
      ],
    });
  });

  it("falls back to vectorize find when hybrid rerank is unavailable", async () => {
    const rerankToArrayMock = vi.fn().mockRejectedValue(new Error("rerank unavailable"));
    const findAndRerankMock = vi.fn(() => ({
      toArray: rerankToArrayMock,
    }));
    const vectorizeFindToArrayMock = vi.fn().mockResolvedValue([
      {
        _id: "doc-2",
        title: "Vectorized Document",
        $similarity: 0.88,
      },
    ]);
    const findMock = vi.fn(() => ({
      toArray: vectorizeFindToArrayMock,
    }));
    getAstraDbMock.mockReturnValue({
      collection: vi.fn(() => ({
        findAndRerank: findAndRerankMock,
        find: findMock,
      })),
    });

    const { searchCollections } = await import("./search");
    const result = await searchCollections({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
      isConnected: true,
      query: "show relevant documents",
      collection: "docs",
      collections: [{ name: "docs", isVectorize: true, vectorDimension: null }],
      collectionsToSearch: [{ name: "docs", isVec: true, vectorDimension: null }],
      userCollections: ["docs"],
      searchMode: "hybrid",
      sortField: null,
      sortDir: "desc",
      limit: 5,
      filterField: null,
      filterOp: null,
      filterValue: null,
      embeddingVector: [],
    });

    expect(findAndRerankMock).toHaveBeenCalledTimes(1);
    expect(findMock).toHaveBeenCalledWith(
      {},
      {
        sort: { $vectorize: "show relevant documents" },
        limit: 5,
        includeSimilarity: true,
      }
    );
    expect(result.searchResults).toEqual([
      {
        id: "doc-2",
        similarity: 0.88,
        preview: { title: "Vectorized Document", $similarity: 0.88 },
        collection: "docs",
      },
    ]);
  });

  it("retries without filters when the first search attempt fails", async () => {
    const toArrayMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("filter failed"))
      .mockResolvedValueOnce([
        {
          _id: "doc-3",
          title: "Recovered Document",
          $similarity: 0.7,
        },
      ]);
    const findMock = vi.fn(() => ({
      toArray: toArrayMock,
    }));
    getAstraDbMock.mockReturnValue({
      collection: vi.fn(() => ({
        find: findMock,
      })),
    });

    const { searchCollections } = await import("./search");
    const result = await searchCollections({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
      isConnected: true,
      query: "show active records",
      collection: "orders",
      collections: [{ name: "orders", isVectorize: false, vectorDimension: 3 }],
      collectionsToSearch: [{ name: "orders", isVec: false, vectorDimension: 3 }],
      userCollections: ["orders"],
      searchMode: "vector",
      sortField: null,
      sortDir: "desc",
      limit: 5,
      filterField: "status",
      filterOp: "$eq",
      filterValue: "active",
      embeddingVector: [0.1, 0.2, 0.3],
    });

    expect(findMock).toHaveBeenNthCalledWith(
      1,
      { status: "active" },
      { sort: { $vector: [0.1, 0.2, 0.3] }, limit: 5, includeSimilarity: true }
    );
    expect(findMock).toHaveBeenNthCalledWith(
      2,
      {},
      { sort: { $vector: [0.1, 0.2, 0.3] }, limit: 5, includeSimilarity: true }
    );
    expect(result.commandStr).toContain('.find({}, { sort: { $vector: embedding }');
    expect(result.searchResults[0]).toMatchObject({
      id: "doc-3",
      similarity: 0.7,
    });
  });

  it("falls back to other collections when the top hit is low confidence", async () => {
    const collectionRefs = {
      orders: {
        find: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([
            { _id: "doc-low", title: "Low Confidence", $similarity: 0.2 },
          ]),
        })),
      },
      customers: {
        find: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([
            { _id: "doc-high", title: "Best Match", $similarity: 0.91 },
          ]),
        })),
      },
    };
    getAstraDbMock.mockReturnValue({
      collection: vi.fn((name: keyof typeof collectionRefs) => collectionRefs[name]),
    });

    const { searchCollections } = await import("./search");
    const result = await searchCollections({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
      isConnected: true,
      query: "find the right customer",
      collection: "orders",
      collections: [
        { name: "orders", isVectorize: false, vectorDimension: 3 },
        { name: "customers", isVectorize: false, vectorDimension: 3 },
      ],
      collectionsToSearch: [{ name: "orders", isVec: false, vectorDimension: 3 }],
      userCollections: ["orders", "customers"],
      searchMode: "vector",
      sortField: null,
      sortDir: "desc",
      limit: 5,
      filterField: null,
      filterOp: null,
      filterValue: null,
      embeddingVector: [0.1, 0.2, 0.3],
    });

    expect(result.collection).toBe("customers");
    expect(result.commandStr).toBe("// Low-confidence fallback: searched customers");
    expect(result.searchResults[0]).toMatchObject({
      id: "doc-high",
      collection: "customers",
      similarity: 0.91,
    });
  });

  it("aggregates multi-collection searches and reports how many succeeded", async () => {
    const collectionRefs = {
      orders: {
        find: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([
            { _id: "doc-1", title: "Order", $similarity: 0.65 },
          ]),
        })),
      },
      customers: {
        find: vi.fn(() => ({
          toArray: vi.fn().mockRejectedValue(new Error("collection unavailable")),
        })),
      },
    };
    getAstraDbMock.mockReturnValue({
      collection: vi.fn((name: keyof typeof collectionRefs) => collectionRefs[name]),
    });

    const { searchCollections } = await import("./search");
    const result = await searchCollections({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
      isConnected: true,
      query: "search everything",
      collection: "orders",
      collections: [
        { name: "orders", isVectorize: false, vectorDimension: 3 },
        { name: "customers", isVectorize: false, vectorDimension: 3 },
      ],
      collectionsToSearch: [
        { name: "orders", isVec: false, vectorDimension: 3 },
        { name: "customers", isVec: false, vectorDimension: 3 },
      ],
      userCollections: ["orders", "customers"],
      searchMode: "vector",
      sortField: null,
      sortDir: "desc",
      limit: 5,
      filterField: "region",
      filterOp: "$gt",
      filterValue: 2,
      embeddingVector: [0.1, 0.2, 0.3],
    });

    expect(result.commandStr).toBe("// Searched 1 collection: orders, customers");
    expect(result.searchResults).toEqual([
      {
        id: "doc-1",
        similarity: 0.65,
        preview: { title: "Order", $similarity: 0.65 },
        collection: "orders",
      },
    ]);
  });
});
