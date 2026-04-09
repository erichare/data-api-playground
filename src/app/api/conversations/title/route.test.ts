import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.fn();
const resolveBackendMock = vi.fn();

vi.mock("@/lib/ai/service", () => ({
  generateText: generateTextMock,
  resolveBackend: resolveBackendMock,
}));

describe("/api/conversations/title route", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;

    resolveBackendMock.mockReturnValue({
      provider: "huggingface",
      source: "manual",
      huggingfaceApiKey: "hf-key",
      huggingFaceKeyPresent: true,
      chatModel: "ibm-granite/granite-3.3-8b-instruct",
      embedModel: "ibm-granite/granite-embedding-125m-english",
      ollamaBaseUrl: "http://127.0.0.1:11434",
    });
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;

    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;
  });

  it("generates and sanitizes a short title", async () => {
    generateTextMock.mockResolvedValueOnce({
      content: '"Customer Feedback Trends"',
      provider: "huggingface",
      model: "ibm-granite/granite-3.3-8b-instruct",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstMessage: "Summarize my customer feedback trends",
          huggingfaceApiKey: "hf-key",
        }),
      }) as never
    );

    expect(await response.json()).toEqual({
      title: "Customer Feedback Trends",
    });
    expect(resolveBackendMock).toHaveBeenCalledWith({
      huggingfaceApiKey: "hf-key",
    });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowPull: false,
        maxTokens: 20,
      })
    );
  });

  it("returns null when title generation fails", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("provider failed"));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstMessage: "hello" }),
      }) as never
    );

    expect(await response.json()).toEqual({ title: null });
  });
});
