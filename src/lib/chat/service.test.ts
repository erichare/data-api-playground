import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedAiBackend } from "@/lib/ai/service";

const embedQueryMock = vi.fn();
const searchCollectionsMock = vi.fn();
const generateResponseMock = vi.fn();
const generateTextMock = vi.fn();

vi.mock("@/lib/chat/search", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat/search")>(
    "@/lib/chat/search"
  );

  return {
    ...actual,
    embedQuery: embedQueryMock,
    searchCollections: searchCollectionsMock,
  };
});

vi.mock("@/lib/chat/response", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat/response")>(
    "@/lib/chat/response"
  );

  return {
    ...actual,
    generateResponse: generateResponseMock,
  };
});

vi.mock("@/lib/ai/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/service")>(
    "@/lib/ai/service"
  );

  return {
    ...actual,
    generateText: generateTextMock,
  };
});

const huggingFaceBackend: ResolvedAiBackend = {
  provider: "huggingface",
  source: "manual",
  huggingfaceApiKey: "hf-key",
  huggingFaceKeyPresent: true,
  chatModel: "Qwen/Qwen2.5-Coder-32B-Instruct",
  embedModel: "ibm-granite/granite-embedding-125m-english",
  ollamaBaseUrl: "http://127.0.0.1:11434",
};

const ollamaBackend: ResolvedAiBackend = {
  provider: "ollama",
  source: "local",
  huggingFaceKeyPresent: false,
  chatModel: "granite3.1-dense:8b",
  embedModel: "granite-embedding:278m",
  ollamaBaseUrl: "http://127.0.0.1:11434",
};

describe("runChatWorkflow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    generateTextMock.mockResolvedValue({
      content: JSON.stringify({
        collection: "orders",
        searchMode: "hybrid",
        intent: "Find spending data",
        limit: 3,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    embedQueryMock.mockResolvedValue({
      embeddingVector: [0.12, 0.34],
      vectorPreview: [0.12, 0.34],
      realEmbedding: true,
      provider: "huggingface",
      model: huggingFaceBackend.embedModel,
    });

    searchCollectionsMock.mockResolvedValue({
      searchResults: [
        {
          id: "doc-1",
          similarity: 0.92,
          preview: { total_spend: 1200 },
          collection: "orders",
        },
      ],
      commandStr: 'await db.collection("orders").find({}, { limit: 5 }).toArray()',
      collection: "orders",
    });

    generateResponseMock.mockResolvedValue({
      content: "Here is the answer.",
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });
  });

  it("uses the analyzed collection fields when the backend switches away from the active collection", async () => {
    const send = vi.fn();

    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Show top spend by customer",
        searchMode: "hybrid",
        activeCollection: "customers",
        collections: [
          { name: "customers", isVectorize: false },
          { name: "orders", isVectorize: false },
        ],
        allCollectionFields: {
          customers: ["first_name", "last_name"],
          orders: ["customer_id", "total_spend"],
        },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "analyze",
        status: "complete",
        data: expect.objectContaining({
          collection: "orders",
          fields: ["customer_id", "total_spend"],
          provider: "huggingface",
          model: huggingFaceBackend.chatModel,
        }),
      })
    );
    expect(generateResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "orders",
        collectionFields: ["customer_id", "total_spend"],
      })
    );
  });

  it("skips embedding and search for a format-only follow-up", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "orders",
        searchMode: "hybrid",
        intent: "Format prior answer",
        limit: 5,
        skipSearch: true,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "in a table",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: {
          orders: ["customer_id", "total_spend"],
        },
        history: [
          {
            role: "assistant",
            content: "Order 1 spent the most.",
          },
        ],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    expect(send).toHaveBeenCalledWith({ step: "embed", status: "skipped" });
    expect(send).toHaveBeenCalledWith({ step: "search", status: "skipped" });
    expect(embedQueryMock).not.toHaveBeenCalled();
    expect(searchCollectionsMock).not.toHaveBeenCalled();
    expect(generateResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skipSearch: true,
      })
    );
  });

  it("marks collection overview questions as all-collections without running search", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "orders",
        searchMode: "hybrid",
        intent: "List collections",
        limit: 5,
        skipSearch: true,
        allCollections: true,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();

    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "What collections do I have?",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [
          { name: "orders", isVectorize: false },
          { name: "customers", isVectorize: true },
          { name: "dap_internal", isVectorize: false },
        ],
        allCollectionFields: {
          orders: ["customer_id"],
          customers: ["email"],
        },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "analyze",
        status: "complete",
        data: expect.objectContaining({
          allCollections: true,
          skipSearch: true,
          collections: ["orders", "customers"],
        }),
      })
    );
    expect(generateResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allCollections: true,
        userCollections: ["orders", "customers"],
        skipSearch: true,
      })
    );
  });

  it("forwards streamed response chunks as running respond events", async () => {
    generateResponseMock.mockImplementationOnce(async ({ onTextChunk }) => {
      onTextChunk?.({
        content: "Here is",
        delta: "Here is",
        provider: "huggingface",
        model: huggingFaceBackend.chatModel,
      });
      onTextChunk?.({
        content: "Here is the answer.",
        delta: " the answer.",
        provider: "huggingface",
        model: huggingFaceBackend.chatModel,
      });
      return {
        content: "Here is the answer.",
        provider: "huggingface",
        model: huggingFaceBackend.chatModel,
      };
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Show top spend by customer",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: { orders: ["total_spend"] },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "respond",
        status: "running",
        data: expect.objectContaining({
          content: "Here is",
          delta: "Here is",
        }),
      })
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "respond",
        status: "running",
        data: expect.objectContaining({
          content: "Here is the answer.",
          delta: " the answer.",
        }),
      })
    );
  });

  it("falls back gracefully when the LLM returns unparsable JSON", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: "Here is the analysis: {invalid json content: [broken}",
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Show top spend by customer",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: { orders: ["total_spend"] },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    const analyzeEvent = send.mock.calls.find(
      ([e]) => e.step === "analyze" && e.status === "complete"
    );
    expect(analyzeEvent).toBeDefined();
    // The extracted {...} is invalid JSON, so the error catch fires
    expect(analyzeEvent[0].data._raw).toContain("ERROR:");
    expect(analyzeEvent[0].data.collection).toBe("orders");
  });

  it("strips markdown code fences from LLM response before parsing JSON", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: '```json\n{"collection":"orders","searchMode":"vector","intent":"Find data","limit":3}\n```',
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Show top spend by customer",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: { orders: ["total_spend"] },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    const analyzeEvent = send.mock.calls.find(
      ([e]) => e.step === "analyze" && e.status === "complete"
    );
    expect(analyzeEvent[0].data.searchMode).toBe("vector");
    expect(analyzeEvent[0].data.limit).toBe(3);
  });

  it("clamps limit to MAX_LIMIT and respects sort/filter fields", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "orders",
        searchMode: "lexical",
        intent: "Find expensive orders",
        limit: 5000,
        sortField: "amount",
        sortDir: "asc",
        filterField: "status",
        filterOp: "$ne",
        filterValue: "cancelled",
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Show top orders",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: { orders: ["amount", "status"] },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    const analyzeEvent = send.mock.calls.find(
      ([e]) => e.step === "analyze" && e.status === "complete"
    );
    expect(analyzeEvent[0].data.limit).toBe(1000); // MAX_LIMIT
    expect(analyzeEvent[0].data.searchMode).toBe("lexical");
    expect(analyzeEvent[0].data.sortField).toBe("amount");
    expect(analyzeEvent[0].data.sortDir).toBe("asc");
    expect(analyzeEvent[0].data.filterField).toBe("status");
    expect(analyzeEvent[0].data.filterOp).toBe("$ne");
    expect(analyzeEvent[0].data.filterValue).toBe("cancelled");
  });

  it("rejects invalid searchMode and limit <= 0 from LLM", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "orders",
        searchMode: "invalid_mode",
        intent: "Find data",
        limit: -5,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Show data",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: { orders: ["total_spend"] },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    const analyzeEvent = send.mock.calls.find(
      ([e]) => e.step === "analyze" && e.status === "complete"
    );
    // invalid_mode is rejected, default "hybrid" stays
    expect(analyzeEvent[0].data.searchMode).toBe("hybrid");
    // limit <= 0 is rejected, default 5 stays
    expect(analyzeEvent[0].data.limit).toBe(5);
  });

  it("handles targeted multi-collection searches from the LLM", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "orders",
        collections: ["orders", "inventory"],
        searchMode: "hybrid",
        intent: "Search orders and inventory",
        limit: 5,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    searchCollectionsMock.mockResolvedValue({
      searchResults: [
        { id: "doc-1", similarity: 0.9, preview: { title: "A" }, collection: "orders" },
      ],
      commandStr: "// multi-collection search",
      collection: "orders",
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Show items across orders and inventory",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [
          { name: "orders", isVectorize: false },
          { name: "inventory", isVectorize: false },
        ],
        allCollectionFields: {
          orders: ["amount"],
          inventory: ["quantity"],
        },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    const analyzeEvent = send.mock.calls.find(
      ([e]) => e.step === "analyze" && e.status === "complete"
    );
    expect(analyzeEvent[0].data.collections).toEqual(["orders", "inventory"]);
    expect(analyzeEvent[0].data.intent).toContain("orders, inventory");
  });

  it("triggers CROSS_COLLECTION_RE fallback for broad queries", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "orders",
        searchMode: "hybrid",
        intent: "Overview",
        limit: 5,
        allCollections: false,
        skipSearch: false,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Tell me about all my data",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [
          { name: "orders", isVectorize: false },
          { name: "customers", isVectorize: false },
        ],
        allCollectionFields: {},
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    const analyzeEvent = send.mock.calls.find(
      ([e]) => e.step === "analyze" && e.status === "complete"
    );
    // CROSS_COLLECTION_RE should set allCollections = true
    expect(analyzeEvent[0].data.allCollections).toBe(true);
  });

  it("triggers COLLECTIONS_META_RE to skip search on schema queries", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "orders",
        searchMode: "hybrid",
        intent: "List collections",
        limit: 5,
        skipSearch: false,
        allCollections: false,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "What collections do I have?",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: {},
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    const analyzeEvent = send.mock.calls.find(
      ([e]) => e.step === "analyze" && e.status === "complete"
    );
    expect(analyzeEvent[0].data.skipSearch).toBe(true);
    expect(analyzeEvent[0].data.allCollections).toBe(true);
  });

  it("triggers REFORMAT_RE to skip search on reformat follow-ups with history", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "orders",
        searchMode: "hybrid",
        intent: "Reformat output",
        limit: 5,
        skipSearch: false,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Show that in a table",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: {},
        history: [
          { role: "assistant", content: "Here are the results." },
        ],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    const analyzeEvent = send.mock.calls.find(
      ([e]) => e.step === "analyze" && e.status === "complete"
    );
    expect(analyzeEvent[0].data.skipSearch).toBe(true);
  });

  it("skips search and flags missing collection when LLM picks a non-existent collection", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "Cheese",
        searchMode: "hybrid",
        intent: "Find cheese data",
        limit: 5,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "What is in my Cheese collection?",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: { orders: ["amount"] },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    const analyzeEvent = send.mock.calls.find(
      ([e]) => e.step === "analyze" && e.status === "complete"
    );
    // Falls back to the default collection name
    expect(analyzeEvent[0].data.collection).toBe("orders");
    // But search is skipped so we don't query the wrong collection
    expect(analyzeEvent[0].data.skipSearch).toBe(true);
    // embed and search should be skipped
    expect(send).toHaveBeenCalledWith({ step: "embed", status: "skipped" });
    expect(send).toHaveBeenCalledWith({ step: "search", status: "skipped" });
    expect(embedQueryMock).not.toHaveBeenCalled();
    expect(searchCollectionsMock).not.toHaveBeenCalled();
    // generateResponse should receive requestedCollectionMissing
    expect(generateResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedCollectionMissing: "Cheese",
        skipSearch: true,
      })
    );
  });

  it("detects non-existent collection reference even when LLM picks a valid collection", async () => {
    // LLM is smart and picks "orders" (a real collection) even though user said "Lettuce"
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "orders",
        searchMode: "hybrid",
        intent: "Find data in collection",
        limit: 5,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "What's in my Lettuce collection?",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: { orders: ["amount"] },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    // Heuristic detects "Lettuce" is not a real collection
    expect(send).toHaveBeenCalledWith({ step: "embed", status: "skipped" });
    expect(send).toHaveBeenCalledWith({ step: "search", status: "skipped" });
    expect(embedQueryMock).not.toHaveBeenCalled();
    expect(searchCollectionsMock).not.toHaveBeenCalled();
    expect(generateResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedCollectionMissing: "Lettuce",
        skipSearch: true,
      })
    );
  });

  it("does NOT flag collection as missing when user references an existing collection", async () => {
    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "What's in my orders collection?",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: { orders: ["amount"] },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    // Search should NOT be skipped — "orders" exists
    expect(embedQueryMock).toHaveBeenCalled();
    expect(searchCollectionsMock).toHaveBeenCalled();
    expect(generateResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedCollectionMissing: undefined,
      })
    );
  });

  it("uses dap_-prefixed active collection fallback to first user collection", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        searchMode: "hybrid",
        intent: "Find data",
        limit: 5,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Show data",
        searchMode: "hybrid",
        activeCollection: "dap_internal",
        collections: [
          { name: "dap_internal", isVectorize: false },
          { name: "products", isVectorize: false },
        ],
        allCollectionFields: { products: ["name"] },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    const analyzeEvent = send.mock.calls.find(
      ([e]) => e.step === "analyze" && e.status === "complete"
    );
    // Active collection starts with dap_, so default falls to first user collection
    expect(analyzeEvent[0].data.collection).toBe("products");
  });

  it("handles vectorize collections and multi-collection fan-out search", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "docs",
        searchMode: "hybrid",
        intent: "Find docs",
        limit: 5,
        allCollections: true,
      }),
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    embedQueryMock.mockResolvedValue({
      embeddingVector: [],
      vectorPreview: [],
      realEmbedding: true,
      provider: "astra",
      model: "server-side vectorize",
    });

    searchCollectionsMock.mockResolvedValue({
      searchResults: [
        { id: "doc-1", similarity: 0.9, preview: { title: "A" }, collection: "docs" },
      ],
      commandStr: "// all-collections search",
      collection: "docs",
    });

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Tell me about all my data",
        searchMode: "hybrid",
        activeCollection: "docs",
        collections: [
          { name: "docs", isVectorize: true },
          { name: "notes", isVectorize: true },
        ],
        allCollectionFields: {},
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: huggingFaceBackend,
      send,
    });

    const embedEvent = send.mock.calls.find(
      ([e]) => e.step === "embed" && e.status === "complete"
    );
    // Vectorize means dims should be 0
    expect(embedEvent[0].data.dims).toBe(0);
  });

  it("completes prepare before streamed response chunks arrive", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: JSON.stringify({
        collection: "orders",
        searchMode: "hybrid",
        intent: "Find spending data",
        limit: 3,
      }),
      provider: "ollama",
      model: ollamaBackend.chatModel,
    });

    generateResponseMock.mockImplementationOnce(
      async ({ onPrepareProgress, onPrepared, onTextChunk }) => {
        onPrepareProgress?.({
          provider: "ollama",
          kind: "chat",
          model: ollamaBackend.chatModel,
          status: "Model already installed",
          determinate: false,
        });
        onPrepared?.({
          downloaded: false,
          model: ollamaBackend.chatModel,
        });
        onTextChunk?.({
          content: "Here is the answer.",
          delta: "Here is the answer.",
          provider: "ollama",
          model: ollamaBackend.chatModel,
        });

        return {
          content: "Here is the answer.",
          provider: "ollama",
          model: ollamaBackend.chatModel,
        };
      }
    );

    const send = vi.fn();
    const { runChatWorkflow } = await import("./service");
    await runChatWorkflow({
      payload: {
        query: "Show top spend by customer",
        searchMode: "hybrid",
        activeCollection: "orders",
        collections: [{ name: "orders", isVectorize: false }],
        allCollectionFields: { orders: ["total_spend"] },
        history: [],
      },
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      backend: ollamaBackend,
      send,
    });

    const events = send.mock.calls.map(([event]) => event);
    const prepareCompleteIndex = events.findIndex(
      (event) =>
        event.step === "prepare" &&
        event.status === "complete" &&
        event.data?.kind === "chat"
    );
    const respondRunningIndex = events.findIndex(
      (event) => event.step === "respond" && event.status === "running" && event.data?.delta
    );

    expect(prepareCompleteIndex).toBeGreaterThanOrEqual(0);
    expect(respondRunningIndex).toBeGreaterThan(prepareCompleteIndex);
  });
});
