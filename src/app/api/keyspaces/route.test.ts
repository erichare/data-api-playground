import { beforeEach, describe, expect, it, vi } from "vitest";

const listKeyspacesMock = vi.fn();
const adminMock = vi.fn(() => ({
  listKeyspaces: listKeyspacesMock,
}));
const getAstraDbMock = vi.fn(() => ({
  admin: adminMock,
}));
const resolveAstraConnectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
}));

describe("/api/keyspaces route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    resolveAstraConnectionMock.mockReturnValue({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
    });
  });

  it("returns 400 when no Astra credentials are available", async () => {
    resolveAstraConnectionMock.mockReturnValueOnce({
      token: "",
      endpoint: "",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/keyspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "token and endpoint are required",
    });
  });

  it("lists Astra keyspaces through the admin client", async () => {
    listKeyspacesMock.mockResolvedValueOnce(["default_keyspace", "analytics"]);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/keyspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as never
    );

    expect(await response.json()).toEqual({
      keyspaces: ["default_keyspace", "analytics"],
    });
    expect(getAstraDbMock).toHaveBeenCalledWith(
      "AstraCS:secret",
      "https://db.apps.astra.datastax.com"
    );
  });

  it("returns a 400 when Astra keyspace listing fails", async () => {
    listKeyspacesMock.mockRejectedValueOnce(new Error("boom"));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/keyspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "boom",
    });
  });
});
