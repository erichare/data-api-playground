import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuthMock,
  getBackendStatusesMock,
} = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  getBackendStatusesMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/backends/server", () => ({
  getBackendStatuses: getBackendStatusesMock,
}));

describe("/api/backend-status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns backend readiness when auth passes", async () => {
    requireApiAuthMock.mockReturnValue(null);
    getBackendStatusesMock.mockReturnValue({
      astra: {
        kind: "astra",
        ready: true,
        hasEndpoint: true,
        hasToken: true,
      },
      hcd: {
        kind: "hcd",
        ready: false,
        hasEndpoint: false,
        hasUsername: false,
        hasPassword: false,
      },
      defaultBackend: "astra",
    });

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/backend-status"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      astra: {
        kind: "astra",
        ready: true,
        hasEndpoint: true,
        hasToken: true,
      },
      hcd: {
        kind: "hcd",
        ready: false,
        hasEndpoint: false,
        hasUsername: false,
        hasPassword: false,
      },
      defaultBackend: "astra",
    });
  });

  it("returns auth failures without reading backend readiness", async () => {
    requireApiAuthMock.mockReturnValue(new Response("denied", { status: 401 }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/backend-status"));

    expect(response.status).toBe(401);
    expect(getBackendStatusesMock).not.toHaveBeenCalled();
  });
});
