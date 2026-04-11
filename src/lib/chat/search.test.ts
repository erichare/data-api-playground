import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedAiBackend } from "@/lib/ai/service";

const getAstraDbMock = vi.fn();
const embedManyMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  SYSTEM_FIELDS: new Set(["_id", "$vector"]),
}));

vi.mock("@/lib/ai/service", () => ({
  embedMany: embedManyMock,
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
});
