import { beforeEach, describe, expect, it, vi } from "vitest";

const createCollectionInAstraMock = vi.fn();

vi.mock("@/lib/collections/service", () => ({
  createCollectionInAstra: createCollectionInAstraMock,
}));

describe("/api/create-collection route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 400 when the collection service rejects missing credentials", async () => {
    createCollectionInAstraMock.mockRejectedValue(
      new Error("token, endpoint, and name are required")
    );

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

  it("returns the collection created by the service", async () => {
    createCollectionInAstraMock.mockResolvedValue({
      name: "docs",
      count: 0,
      vectorDim: 1024,
      vectorizeService: {
        provider: "nvidia",
        modelName: "NV-Embed-QA",
      },
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

    expect(await response.json()).toEqual({
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
