import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiAuthMock,
  getAstraCliStatusMock,
} = vi.hoisted(() => ({
  requireApiAuthMock: vi.fn(),
  getAstraCliStatusMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireApiAuth: requireApiAuthMock,
}));

vi.mock("@/lib/astraCli", () => ({
  getAstraCliStatus: getAstraCliStatusMock,
}));

describe("/api/data-api-config route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Astra CLI config status for the requested profile", async () => {
    requireApiAuthMock.mockReturnValue(null);
    getAstraCliStatusMock.mockReturnValue({
      available: true,
      configured: true,
      profiles: [{ name: "default", isDefault: true }],
      selectedProfile: "default",
      databases: [],
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/data-api-config?profile=default")
    );

    expect(response.status).toBe(200);
    expect(getAstraCliStatusMock).toHaveBeenCalledWith("default");
    expect(await response.json()).toEqual({
      astraCli: {
        available: true,
        configured: true,
        profiles: [{ name: "default", isDefault: true }],
        selectedProfile: "default",
        databases: [],
      },
    });
  });

  it("returns auth failures before reading local config", async () => {
    requireApiAuthMock.mockReturnValue(new Response("denied", { status: 401 }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/data-api-config"));

    expect(response.status).toBe(401);
    expect(getAstraCliStatusMock).not.toHaveBeenCalled();
  });
});
