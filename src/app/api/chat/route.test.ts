import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAstraConnectionMock = vi.fn();
const resolveBackendMock = vi.fn();
const runChatWorkflowMock = vi.fn();
const requireApiAuthMock = vi.fn();
const parseJsonBodyMock = vi.fn();
const isErrorResponseMock = vi.fn();
const createRequestLogContextMock = vi.fn();
const logErrorMock = vi.fn();
const createRateLimiterMock = vi.fn();
const getClientIpMock = vi.fn();
const checkMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  resolveAstraConnection: resolveAstraConnectionMock,
}));

vi.mock("@/lib/ai/service", () => ({
  resolveBackend: resolveBackendMock,
}));

vi.mock("@/lib/chat/service", () => ({
  runChatWorkflow: runChatWorkflowMock,
}));

vi.mock("@/lib/auth", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/validation/parse", () => ({
  parseJsonBody: parseJsonBodyMock,
  isErrorResponse: isErrorResponseMock,
}));

vi.mock("@/lib/server/log", () => ({
  createRequestLogContext: createRequestLogContextMock,
  logError: logErrorMock,
  sanitizeErrorForClient: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: createRateLimiterMock,
  getClientIp: getClientIpMock,
}));

describe("/api/chat route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resolveAstraConnectionMock.mockReturnValue({
      token: "",
      endpoint: "",
    });
    resolveBackendMock.mockReturnValue({
      provider: "huggingface",
      source: "manual",
      huggingfaceApiKey: "hf-key",
      huggingFaceKeyPresent: true,
      chatModel: "chat-model",
      embedModel: "embed-model",
      ollamaBaseUrl: "http://127.0.0.1:11434",
    });
    requireApiAuthMock.mockReturnValue(null);
    parseJsonBodyMock.mockResolvedValue({
      query: "What collections do I have?",
      searchMode: "hybrid",
      collections: [
        { name: "books", isVectorize: false, vectorDimension: 768 },
        { name: "notes", isVectorize: true, vectorDimension: null },
      ],
      activeCollection: "books",
      history: [],
      huggingfaceApiKey: "hf-key",
    });
    isErrorResponseMock.mockReturnValue(false);
    createRequestLogContextMock.mockReturnValue({ requestId: "req-123" });
    getClientIpMock.mockReturnValue("127.0.0.1");
    checkMock.mockReturnValue({ limited: false, retryAfterMs: 0 });
    createRateLimiterMock.mockReturnValue({ check: checkMock });
  });

  it("streams whatever the chat service emits", async () => {
    runChatWorkflowMock.mockImplementation(async ({ send }) => {
      send({ step: "embed", status: "skipped" });
      send({ step: "search", status: "skipped" });
      send({
        step: "respond",
        status: "running",
        data: { delta: "You have ", content: "You have " },
      });
      send({
        step: "respond",
        status: "complete",
        latencyMs: 3,
        data: { content: "You have two collections." },
      });
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "What collections do I have?",
        searchMode: "hybrid",
        collections: [
          { name: "books", isVectorize: false, vectorDimension: 768 },
          { name: "notes", isVectorize: true, vectorDimension: null },
        ],
        activeCollection: "books",
        history: [],
        huggingfaceApiKey: "hf-key",
      }),
    });

    const response = await POST(request as never);
    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: "embed", status: "skipped" }),
        expect.objectContaining({ step: "search", status: "skipped" }),
        expect.objectContaining({
          step: "respond",
          status: "running",
          data: { delta: "You have ", content: "You have " },
        }),
        expect.objectContaining({
          step: "respond",
          status: "complete",
          data: { content: "You have two collections." },
        }),
      ])
    );
    expect(runChatWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          query: "What collections do I have?",
          activeCollection: "books",
        }),
        token: "",
        endpoint: "",
        backend: expect.objectContaining({
          provider: "huggingface",
        }),
      })
    );
    expect(resolveBackendMock).toHaveBeenCalledWith({ huggingfaceApiKey: "hf-key" });
  });

  it("returns the auth response when API auth fails", async () => {
    requireApiAuthMock.mockReturnValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", { method: "POST" }) as never
    );

    expect(response.status).toBe(401);
    expect(runChatWorkflowMock).not.toHaveBeenCalled();
  });

  it("returns a rate-limit response with retry metadata", async () => {
    checkMock.mockReturnValue({ limited: true, retryAfterMs: 12_000 });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", { method: "POST" }) as never
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(response.headers.get("X-Request-Id")).toBe("req-123");
    await expect(response.json()).resolves.toEqual({
      error: "Rate limit exceeded. Try again later.",
      requestId: "req-123",
    });
  });

  it("returns parse/validation errors directly", async () => {
    const parseError = new Response(
      JSON.stringify({ error: "Invalid body" }),
      { status: 400 }
    );
    parseJsonBodyMock.mockResolvedValue(parseError);
    isErrorResponseMock.mockReturnValue(true);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/chat", { method: "POST" }) as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid body" });
    expect(resolveAstraConnectionMock).not.toHaveBeenCalled();
  });

  it("streams workflow failures as request-scoped errors", async () => {
    runChatWorkflowMock.mockRejectedValue(new Error("workflow blew up"));

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "hello", searchMode: "hybrid" }),
    });

    const response = await POST(request as never);
    const payload = await response.text();

    expect(payload.trim()).toBe(
      JSON.stringify({ error: "workflow blew up", requestId: "req-123" })
    );
    expect(logErrorMock).toHaveBeenCalledWith(
      { requestId: "req-123" },
      "chat.workflow.failed",
      expect.any(Error),
      {
        activeCollection: "books",
        searchMode: "hybrid",
      }
    );
  });
});
