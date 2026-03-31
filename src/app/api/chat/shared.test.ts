import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAstraDbMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  SYSTEM_FIELDS: new Set(["_id", "$vector"]),
}));

describe("chat shared helpers", () => {
  const originalFetch = global.fetch;
  const originalRandom = Math.random;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.fetch = originalFetch;
    Math.random = originalRandom;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Math.random = originalRandom;
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

  it("falls back to Hugging Face embeddings when watsonx returns an invalid shape", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[0.11111, 0.22222, ...Array.from({ length: 110 }, (_, i) => i + 1)]],
    } as Response) as typeof fetch;

    const { embedQuery } = await import("./shared");
    const result = await embedQuery({
      watsonx: {
        embedText: vi.fn().mockResolvedValue({
          result: { results: [{ embedding: [1, 2, 3] }] },
        }),
      } as never,
      projectId: "project-1",
      query: "find the best customer",
      hfKey: "hf-key",
      isVectorize: false,
    });

    expect(result.realEmbedding).toBe(true);
    expect(result.embeddingVector.length).toBeGreaterThan(100);
    expect(result.vectorPreview[0]).toBe(0.1111);
    expect(result.embedError).toBeUndefined();
  });

  it("returns a synthetic preview and combined error message when both embedding providers fail", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "service unavailable",
    } as Response) as typeof fetch;
    Math.random = vi.fn(() => 0.75);

    const { embedQuery } = await import("./shared");
    const result = await embedQuery({
      watsonx: {
        embedText: vi.fn().mockRejectedValue(new Error("watsonx down")),
      } as never,
      projectId: "project-1",
      query: "find the best customer",
      isVectorize: false,
    });

    expect(result.realEmbedding).toBe(false);
    expect(result.embeddingVector).toEqual([]);
    expect(result.vectorPreview).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(result.embedError).toContain("watsonx embed error: watsonx down");
    expect(result.embedError).toContain("HuggingFace 503: service unavailable");
  });

  it("preserves filter clauses when searching across multiple collections", async () => {
    const toArrayOrdersMock = vi.fn().mockResolvedValue([
      { _id: "o1", total_spend: 500, status: "active" },
    ]);
    const toArrayCustomersMock = vi.fn().mockResolvedValue([
      { _id: "c1", first_name: "Ava", status: "active" },
    ]);

    const findOrdersMock = vi.fn(() => ({ toArray: toArrayOrdersMock }));
    const findCustomersMock = vi.fn(() => ({ toArray: toArrayCustomersMock }));

    getAstraDbMock.mockReturnValue({
      collection: vi.fn((name: string) =>
        name === "orders"
          ? { find: findOrdersMock }
          : { find: findCustomersMock }
      ),
    });

    const { searchCollections } = await import("./shared");
    const result = await searchCollections({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
      isConnected: true,
      query: "show active records",
      collection: "orders",
      collections: [
        { name: "orders", isVectorize: false },
        { name: "customers", isVectorize: false },
      ],
      collectionsToSearch: [
        { name: "orders", isVec: false },
        { name: "customers", isVec: false },
      ],
      userCollections: ["orders", "customers"],
      searchMode: "hybrid",
      sortField: null,
      sortDir: "desc",
      limit: 5,
      filterField: "status",
      filterOp: "$eq",
      filterValue: "active",
      embeddingVector: [],
    });

    expect(findOrdersMock).toHaveBeenCalledWith({ status: "active" }, { limit: 5 });
    expect(findCustomersMock).toHaveBeenCalledWith({ status: "active" }, { limit: 5 });
    expect(result.searchResults).toHaveLength(2);
    expect(result.commandStr).toContain("Searched 2 collections");
  });

  it("retries without a filter when a single-collection filtered search fails", async () => {
    const toArrayWithoutFilterMock = vi.fn().mockResolvedValue([
      { _id: "o1", total_spend: 500 },
    ]);
    const findMock = vi
      .fn()
      .mockImplementationOnce(() => ({
        toArray: vi.fn().mockRejectedValue(new Error("invalid filter")),
      }))
      .mockImplementationOnce(() => ({
        toArray: toArrayWithoutFilterMock,
      }));

    getAstraDbMock.mockReturnValue({
      collection: vi.fn(() => ({
        find: findMock,
      })),
    });

    const { searchCollections } = await import("./shared");
    const result = await searchCollections({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
      isConnected: true,
      query: "show active orders",
      collection: "orders",
      collections: [{ name: "orders", isVectorize: false }],
      collectionsToSearch: [{ name: "orders", isVec: false }],
      userCollections: ["orders"],
      searchMode: "hybrid",
      sortField: null,
      sortDir: "desc",
      limit: 5,
      filterField: "status",
      filterOp: "$eq",
      filterValue: "active",
      embeddingVector: [],
    });

    expect(findMock).toHaveBeenNthCalledWith(1, { status: "active" }, { limit: 5 });
    expect(findMock).toHaveBeenNthCalledWith(2, {}, { limit: 5 });
    expect(result.searchResults).toEqual([
      {
        id: "o1",
        similarity: 1,
        preview: { total_spend: 500 },
        collection: "orders",
      },
    ]);
  });

  it("sanitizes prior search dumps before calling watsonx to generate a response", async () => {
    const textChatMock = vi.fn().mockResolvedValue({
      result: {
        choices: [{ message: { content: "A concise answer." } }],
      },
    });

    const { generateResponse } = await import("./shared");
    const content = await generateResponse({
      watsonx: {
        textChat: textChatMock,
      } as never,
      projectId: "project-1",
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

    expect(content).toBe("A concise answer.");
    const [{ messages }] = textChatMock.mock.calls[0] as [
      { messages: Array<{ role: string; content: string }> },
    ];
    expect(messages[1]?.content).toBe("Previous answer");
    expect(messages[2]?.content).toContain("Reformat or continue your previous response accordingly.");
  });
});
