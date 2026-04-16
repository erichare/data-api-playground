import { beforeEach, describe, expect, it, vi } from "vitest";

const getAiStatusMock = vi.fn();

vi.mock("@/lib/ai/service", () => ({
  getAiStatus: getAiStatusMock,
}));

describe("/api/ai-status route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getAiStatusMock.mockResolvedValue({
      hasHuggingFaceEnvKey: true,
      ollamaReachable: true,
      ollamaBaseUrl: "http://127.0.0.1:11434",
      chatModelInstalled: true,
      embedModelInstalled: false,
      huggingfaceChatModel: "Qwen/Qwen2.5-Coder-32B-Instruct",
      huggingfaceEmbedModel: "ibm-granite/granite-embedding-125m-english",
      ollamaChatModel: "granite3.1-dense:8b",
      ollamaEmbedModel: "granite-embedding:278m",
    });
  });

  it("returns the resolved AI status for authenticated requests", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/ai-status"));

    expect(await response.json()).toEqual({
      hasHuggingFaceEnvKey: true,
      ollamaReachable: true,
      ollamaBaseUrl: "http://127.0.0.1:11434",
      chatModelInstalled: true,
      embedModelInstalled: false,
      huggingfaceChatModel: "Qwen/Qwen2.5-Coder-32B-Instruct",
      huggingfaceEmbedModel: "ibm-granite/granite-embedding-125m-english",
      ollamaChatModel: "granite3.1-dense:8b",
      ollamaEmbedModel: "granite-embedding:278m",
    });
    expect(getAiStatusMock).toHaveBeenCalled();
  });
});
