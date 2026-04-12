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
  chatModel: "ibm-granite/granite-3.3-8b-instruct",
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
});
