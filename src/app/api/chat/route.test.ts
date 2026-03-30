import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAstraConnectionMock = vi.fn();
const runChatWorkflowMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  resolveAstraConnection: resolveAstraConnectionMock,
}));

vi.mock("@/lib/chat/service", () => ({
  runChatWorkflow: runChatWorkflowMock,
}));

describe("/api/chat route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resolveAstraConnectionMock.mockReturnValue({
      token: "",
      endpoint: "",
    });
  });

  it("streams whatever the chat service emits", async () => {
    runChatWorkflowMock.mockImplementation(async ({ send }) => {
      send({ step: "embed", status: "skipped" });
      send({ step: "search", status: "skipped" });
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
          { name: "books", isVectorize: false },
          { name: "notes", isVectorize: true },
        ],
        activeCollection: "books",
        history: [],
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
      })
    );
  });
});
