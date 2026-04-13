import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedAiBackend } from "@/lib/ai/service";

const generateTextMock = vi.fn();
const streamTextMock = vi.fn();

vi.mock("@/lib/ai/service", () => ({
  generateText: generateTextMock,
  streamText: streamTextMock,
}));

const huggingFaceBackend: ResolvedAiBackend = {
  provider: "huggingface",
  source: "manual",
  huggingfaceApiKey: "hf-key",
  huggingFaceKeyPresent: true,
  chatModel: "Qwen/Qwen2.5-Coder-32B-Instruct",
  embedModel: "ibm-granite/granite-embedding-125m-english",
  ollamaBaseUrl: "http://127.0.0.1:11434",
};

describe("chat response helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sanitizes prior search dumps before generating a response", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: "A concise answer.",
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const { generateResponse } = await import("./response");
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
          expect.objectContaining({
            role: "assistant",
            content: "Previous answer",
          }),
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

  it("uses the streaming provider path when a chunk callback is supplied", async () => {
    streamTextMock.mockImplementationOnce(async ({ onChunk }) => {
      onChunk({
        content: "Streaming answer",
        delta: "Streaming answer",
        provider: "huggingface",
        model: huggingFaceBackend.chatModel,
      });
      return {
        content: "Streaming answer",
        provider: "huggingface",
        model: huggingFaceBackend.chatModel,
      };
    });

    const onTextChunk = vi.fn();
    const { generateResponse } = await import("./response");

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
      onTextChunk,
    });

    expect(response.content).toBe("Streaming answer");
    expect(streamTextMock).toHaveBeenCalledOnce();
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(onTextChunk).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Streaming answer" })
    );
  });

  it("includes formatted result context when search results are present", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: "The answer based on results.",
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const { generateResponse } = await import("./response");
    await generateResponse({
      backend: huggingFaceBackend,
      query: "Who spent the most?",
      skipSearch: false,
      searchResults: [
        { id: "doc-1", similarity: 0.95, preview: { name: "Alice", total_spend: 500 } },
        { id: "doc-2", similarity: 0.87, preview: { name: "Bob", total_spend: 300 } },
      ],
      allCollections: false,
      targetedCollections: null,
      userCollections: ["orders"],
      collection: "orders",
      allCollectionFields: { orders: ["name", "total_spend"] },
      collectionFields: ["name", "total_spend"],
    });

    const messages = generateTextMock.mock.calls[0][0].messages;
    const userMessage = messages.find(
      (m: { role: string; content: string }) => m.role === "user"
    );

    expect(userMessage.content).toContain("[1] id=doc-1 similarity=0.95");
    expect(userMessage.content).toContain("[2] id=doc-2 similarity=0.87");
    expect(userMessage.content).toContain("name: Alice");
    expect(userMessage.content).toContain("total_spend: 500");

    const systemMessage = messages.find(
      (m: { role: string; content: string }) => m.role === "system"
    );
    expect(systemMessage.content).toContain(`the "orders" collection`);
  });

  it("mentions no matching records when search runs but returns no results", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: "No records found.",
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const { generateResponse } = await import("./response");
    await generateResponse({
      backend: huggingFaceBackend,
      query: "Find anything?",
      skipSearch: false,
      searchResults: [],
      allCollections: false,
      targetedCollections: null,
      userCollections: ["orders"],
      collection: "orders",
      allCollectionFields: { orders: ["total_spend"] },
      collectionFields: ["total_spend"],
    });

    const messages = generateTextMock.mock.calls[0][0].messages;
    const userMessage = messages.find(
      (m: { role: string; content: string }) => m.role === "user"
    );

    expect(userMessage.content).toContain("no matching records were found");
    // Must NOT tell the AI to use general knowledge (causes hallucination)
    expect(userMessage.content).not.toContain("general knowledge");
    // Should instruct grounding and suggest user actions
    expect(userMessage.content).toContain("Do NOT guess or fabricate");
    expect(userMessage.content).toContain("total_spend");
  });

  it("includes grounding rule in system prompt to prevent hallucination", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: "Answer.",
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const { generateResponse } = await import("./response");
    await generateResponse({
      backend: huggingFaceBackend,
      query: "What is in my Rwar collection?",
      skipSearch: false,
      searchResults: [],
      allCollections: false,
      targetedCollections: null,
      userCollections: ["Rwar"],
      collection: "Rwar",
      allCollectionFields: {},
      collectionFields: [],
    });

    const messages = generateTextMock.mock.calls[0][0].messages;
    const systemMessage = messages.find(
      (m: { role: string; content: string }) => m.role === "system"
    );

    // System prompt must prohibit fabricating data based on collection names
    expect(systemMessage.content).toContain("NEVER guess, infer, or fabricate");
    expect(systemMessage.content).toContain("ONLY describe data that was actually retrieved");
  });

  it("includes collections summary when skipSearch is true, allCollections is true, and there is no history", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: "Here are your collections.",
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const { generateResponse } = await import("./response");
    await generateResponse({
      backend: huggingFaceBackend,
      query: "What collections do I have?",
      skipSearch: true,
      searchResults: [],
      allCollections: true,
      targetedCollections: null,
      userCollections: ["orders", "products"],
      collection: "orders",
      allCollectionFields: {
        orders: ["id", "total_spend"],
        products: ["sku", "price"],
      },
      collectionFields: [],
      history: [],
    });

    const messages = generateTextMock.mock.calls[0][0].messages;
    const userMessage = messages.find(
      (m: { role: string; content: string }) => m.role === "user"
    );

    expect(userMessage.content).toContain("orders");
    expect(userMessage.content).toContain("products");
    expect(userMessage.content).toContain("fields");
  });

  it("uses ALL collections scope description when allCollections is true", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: "All collections answer.",
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const { generateResponse } = await import("./response");
    await generateResponse({
      backend: huggingFaceBackend,
      query: "Summarize everything",
      skipSearch: false,
      searchResults: [
        { id: "doc-1", similarity: 0.9, preview: { field: "value" } },
      ],
      allCollections: true,
      targetedCollections: null,
      userCollections: ["orders", "products"],
      collection: "orders",
      allCollectionFields: {
        orders: ["total_spend"],
        products: ["sku"],
      },
      collectionFields: [],
    });

    const messages = generateTextMock.mock.calls[0][0].messages;
    const systemMessage = messages.find(
      (m: { role: string; content: string }) => m.role === "system"
    );

    expect(systemMessage.content).toContain("ALL collections: orders, products");
  });

  it("uses targeted collections scope and merges their fields when targetedCollections is provided", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: "Targeted answer.",
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const { generateResponse } = await import("./response");
    await generateResponse({
      backend: huggingFaceBackend,
      query: "Compare orders and products",
      skipSearch: false,
      searchResults: [
        { id: "doc-1", similarity: 0.88, preview: { sku: "ABC" } },
      ],
      allCollections: false,
      targetedCollections: ["orders", "products"],
      userCollections: ["orders", "products", "reviews"],
      collection: "orders",
      allCollectionFields: {
        orders: ["total_spend", "customer"],
        products: ["sku", "price"],
        reviews: ["rating"],
      },
      collectionFields: ["total_spend"],
    });

    const messages = generateTextMock.mock.calls[0][0].messages;
    const systemMessage = messages.find(
      (m: { role: string; content: string }) => m.role === "system"
    );

    expect(systemMessage.content).toContain("collections: orders, products");
    expect(systemMessage.content).toContain("total_spend");
    expect(systemMessage.content).toContain("customer");
    expect(systemMessage.content).toContain("sku");
    expect(systemMessage.content).toContain("price");
    expect(systemMessage.content).not.toContain("rating");
  });

  it("falls back to the raw query string when skipSearch is true, allCollections is false, and there is no history", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: "Plain answer.",
      provider: "huggingface",
      model: huggingFaceBackend.chatModel,
    });

    const { generateResponse } = await import("./response");
    await generateResponse({
      backend: huggingFaceBackend,
      query: "Just a plain question",
      skipSearch: true,
      searchResults: [],
      allCollections: false,
      targetedCollections: null,
      userCollections: ["orders"],
      collection: "orders",
      allCollectionFields: { orders: ["total_spend"] },
      collectionFields: ["total_spend"],
    });

    const messages = generateTextMock.mock.calls[0][0].messages;
    const userMessage = messages.find(
      (m: { role: string; content: string }) => m.role === "user"
    );

    expect(userMessage.content).toBe("Just a plain question");
  });
});
