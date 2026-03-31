import { beforeEach, describe, expect, it, vi } from "vitest";

const embedQueryMock = vi.fn();
const searchCollectionsMock = vi.fn();
const generateResponseMock = vi.fn();

vi.mock("@/app/api/chat/shared", async () => {
  const actual = await vi.importActual<typeof import("@/app/api/chat/shared")>(
    "@/app/api/chat/shared"
  );

  return {
    ...actual,
    embedQuery: embedQueryMock,
    searchCollections: searchCollectionsMock,
    generateResponse: generateResponseMock,
  };
});

describe("runChatWorkflow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    embedQueryMock.mockResolvedValue({
      embeddingVector: [0.12, 0.34],
      vectorPreview: [0.12, 0.34],
      realEmbedding: true,
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
    generateResponseMock.mockResolvedValue("Here is the answer.");
  });

  it("uses the analyzed collection fields when the LLM switches away from the active collection", async () => {
    const send = vi.fn();
    const watsonx = {
      textChat: vi
        .fn()
        .mockResolvedValueOnce({
          result: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    collection: "orders",
                    searchMode: "hybrid",
                    intent: "Find spending data",
                    limit: 3,
                  }),
                },
              },
            ],
          },
        }),
    };

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
      watsonx: watsonx as never,
      projectId: "project-1",
      send,
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "analyze",
        status: "complete",
        data: expect.objectContaining({
          collection: "orders",
          fields: ["customer_id", "total_spend"],
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
      watsonx: null,
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
      watsonx: null,
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
