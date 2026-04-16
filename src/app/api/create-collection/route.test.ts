import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ValidationError"; }
}

const createCollectionInAstraMock = vi.fn();

vi.mock("@/lib/collections/service", () => ({
  createCollectionInAstra: createCollectionInAstraMock,
  ValidationError,
}));

describe("/api/create-collection route", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;
    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;
  });

  it("returns 401 when auth is enabled and no cookie is provided", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "test-password";
    process.env.PLAYGROUND_AUTH_SECRET = "test-secret-that-is-long-enough";

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/create-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "docs", dimension: 768, metric: "cosine", provider: "none", model: "none" }),
      }) as never
    );

    expect(response.status).toBe(401);
  });

  it("returns 500 when the service throws a non-validation error", async () => {
    createCollectionInAstraMock.mockRejectedValueOnce(new Error("unexpected error"));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/create-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "docs", dimension: 768, metric: "cosine", provider: "none", model: "none" }),
      }) as never
    );

    expect(response.status).toBe(500);
  });

  it("returns 400 when the collection service rejects missing credentials", async () => {
    createCollectionInAstraMock.mockRejectedValue(
      new ValidationError("token, endpoint, and name are required")
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
        model: "none",
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

  it("forwards Astra CLI-backed collection requests to the service", async () => {
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
        fromAstraCli: true,
        astraCliProfile: "default",
        astraCliDatabase: "db-123",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(createCollectionInAstraMock).toHaveBeenCalledWith({
      name: "docs",
      dimension: 1024,
      metric: "cosine",
      provider: "nvidia",
      model: "NV-Embed-QA",
      token: undefined,
      endpoint: undefined,
      keyspace: undefined,
      fromAstraCli: true,
      astraCliProfile: "default",
      astraCliDatabase: "db-123",
    });
  });

  it('accepts BYO embeddings without a model and defaults it before calling the service', async () => {
    createCollectionInAstraMock.mockResolvedValue({
      name: "plain_docs",
      count: 0,
      vectorDim: 384,
      vectorizeService: null,
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/create-collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "plain_docs",
        dimension: 384,
        metric: "dot_product",
        provider: "none",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(createCollectionInAstraMock).toHaveBeenCalledWith({
      name: "plain_docs",
      dimension: 384,
      metric: "dot_product",
      provider: "none",
      model: "",
    });
    expect(await response.json()).toEqual({
      collection: {
        name: "plain_docs",
        count: 0,
        vectorDim: 384,
        vectorizeService: null,
      },
    });
  });
});
