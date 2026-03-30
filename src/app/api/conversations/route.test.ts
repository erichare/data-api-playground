import { beforeEach, describe, expect, it, vi } from "vitest";

const prepareMock = vi.fn();
const getDbMock = vi.fn(() => ({
  prepare: prepareMock,
}));

vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

describe("/api/conversations route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns conversation rows from sqlite in API shape", async () => {
    prepareMock.mockReturnValueOnce({
      all: () => [
        {
          id: "conv-1",
          name: "Untitled",
          created_at: "2026-03-30T12:00:00.000Z",
          updated_at: "2026-03-30T13:00:00.000Z",
          message_count: 2,
        },
      ],
    });

    const { GET } = await import("./route");
    const response = await GET();

    expect(await response.json()).toEqual({
      conversations: [
        {
          id: "conv-1",
          name: "Untitled",
          createdAt: "2026-03-30T12:00:00.000Z",
          updatedAt: "2026-03-30T13:00:00.000Z",
          messageCount: 2,
        },
      ],
    });
  });

  it("creates a conversation row and returns the inserted metadata", async () => {
    prepareMock.mockReturnValueOnce({
      run: vi.fn(),
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Research Notes" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(body.conversation.name).toBe("Research Notes");
    expect(body.conversation.messageCount).toBe(0);
    expect(prepareMock).toHaveBeenCalled();
  });
});
