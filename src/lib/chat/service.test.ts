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
  chatModel: "ibm-granite/granite-3.3-8b-instruct",
  embedModel: "ibm-granite/granite-embedding-125m-english",
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
});
