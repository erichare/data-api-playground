import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuthMock,
  getKnowledgeBackendStatusesMock,
} = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  getKnowledgeBackendStatusesMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/knowledge/server", () => ({
  getKnowledgeBackendStatuses: getKnowledgeBackendStatusesMock,
}));

describe("/api/knowledge-backend-status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the backend status payload when auth passes", async () => {
    requireApiAuthMock.mockReturnValue(null);
    getKnowledgeBackendStatusesMock.mockReturnValue({
      openrag: {
        kind: "openrag",
        ready: true,
        hasApiKey: true,
        hasBaseUrl: false,
      },
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/knowledge-backend-status"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      openrag: {
        kind: "openrag",
        ready: true,
        hasApiKey: true,
        hasBaseUrl: false,
      },
    });
  });

  it("returns auth failures without reading backend status", async () => {
    requireApiAuthMock.mockReturnValue(new Response("denied", { status: 401 }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/knowledge-backend-status"));

    expect(response.status).toBe(401);
    expect(getKnowledgeBackendStatusesMock).not.toHaveBeenCalled();
  });
});
