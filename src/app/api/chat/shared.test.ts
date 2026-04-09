import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedAiBackend } from "@/lib/ai/service";

const getAstraDbMock = vi.fn();
const embedManyMock = vi.fn();
const generateTextMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  SYSTEM_FIELDS: new Set(["_id", "$vector"]),
}));

vi.mock("@/lib/ai/service", () => ({
  embedMany: embedManyMock,
  generateText: generateTextMock,
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

describe("chat shared helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a compact document preview and skips system fields", async () => {
    const { docPreview } = await import("./shared");

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

    const { embedQuery } = await import("./shared");
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
    const { embedQuery } = await import("./shared");
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

    const { searchCollections } = await import("./shared");

    await expect(
      searchCollections({
        token: "AstraCS:secret",
        endpoint: "https://db.apps.astra.datastax.com",
        keyspace: "default_keyspace",
        isConnected: true,
        query: "show active records",
        collection: "orders",
        collections: [{ name: "orders", isVectorize: false, vectorDimension: 768 }],
        collectionsToSearch: [{ name: "orders", isVec: false, vectorDimension: 768 }],
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

  it("sanitizes prior search dumps before generating a response", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: "A concise answer.",
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const { generateResponse } = await import("./shared");
    const response = await generateResponse({
      backend: huggingFaceBackend,
      query: "Summarize the results",
      skipSearch: true,
      searchResults: [],
      allCollections: false,
      targetedCollections: null,
      userCollections: ["orders"],
      collection: "orders",
      allCollectionFields: { orders: ["total_spend"] },
      collectionFields: ["total_spend"],
      history: [
        {
          role: "assistant",
          content:
            "Previous answer\n[Search results shown to user:]\n[1] total_spend: 500\n[End of Conversation]",
        },
      ],
    });

    expect(response.content).toBe("A concise answer.");
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "assistant", content: "Previous answer" }),
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining(
              "Reformat or continue your previous response accordingly."
            ),
          }),
        ]),
      })
    );
  });
});
