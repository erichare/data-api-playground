import { beforeEach, describe, expect, it, vi } from "vitest";

const createCollectionMock = vi.fn();
const getAstraDbMock = vi.fn(() => ({
  createCollection: createCollectionMock,
}));
const resolveAstraConnectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
}));

describe("/api/create-collection route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 400 when required connection fields are missing", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "",
      endpoint: "",
      keyspace: "default_keyspace",
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/create-collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "docs",
        dimension: 768,
        metric: "cosine",
        provider: "none",
        model: "",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "token, endpoint, and name are required",
    });
  });

  it("creates a vectorize collection and returns the new collection metadata", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/create-collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "docs",
        dimension: 1024,
        metric: "cosine",
        provider: "nvidia",
        model: "NV-Embed-QA",
      }),
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(createCollectionMock).toHaveBeenCalledWith("docs", {
      vector: {
        dimension: 1024,
        metric: "cosine",
        service: {
          provider: "nvidia",
          modelName: "NV-Embed-QA",
        },
      },
    });
    expect(body).toEqual({
      collection: {
        name: "docs",
        count: 0,
        vectorDim: 1024,
        vectorizeService: {
          provider: "nvidia",
          modelName: "NV-Embed-QA",
        },
      },
    });
  });
});
