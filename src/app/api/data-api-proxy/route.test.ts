import { beforeEach, describe, expect, it, vi } from "vitest";

const getAstraDbMock = vi.fn();
const isAllowedAstraEndpointMock = vi.fn();
const resolveAstraConnectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  isAllowedAstraEndpoint: isAllowedAstraEndpointMock,
  resolveAstraConnection: resolveAstraConnectionMock,
}));

describe("/api/data-api-proxy route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resolveAstraConnectionMock.mockReturnValue({
      token: "AstraCS:test",
      endpoint: "https://db-id-us-east1.apps.astra.datastax.com",
      keyspace: "default_keyspace",
    });
  });

  it("rejects non-Astra endpoints", async () => {
    isAllowedAstraEndpointMock.mockReturnValue(false);

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/data-api-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection: "docs",
        requestBody: { find: { filter: {} } },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Endpoint must be a valid Astra DB API endpoint",
      requestId: expect.any(String),
    });
    expect(getAstraDbMock).not.toHaveBeenCalled();
  });

  it("executes supported collection operations through Astra helpers", async () => {
    isAllowedAstraEndpointMock.mockReturnValue(true);
    const toArrayMock = vi.fn().mockResolvedValue([{ title: "Doc 1" }]);
    getAstraDbMock.mockReturnValue({
      collection: vi.fn(() => ({
        find: vi.fn(() => ({ toArray: toArrayMock })),
      })),
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/data-api-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection: "docs",
        requestBody: { find: { filter: { topic: "security" }, options: { limit: 5 } } },
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 200,
      statusText: "OK",
      data: [{ title: "Doc 1" }],
    });
    expect(toArrayMock).toHaveBeenCalled();
  });
});
