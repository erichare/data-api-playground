import { beforeEach, describe, expect, it, vi } from "vitest";

const findEmbeddingProvidersMock = vi.fn();
const adminMock = vi.fn(() => ({
  findEmbeddingProviders: findEmbeddingProvidersMock,
}));
const getAstraDbMock = vi.fn(() => ({
  admin: adminMock,
}));
const resolveAstraConnectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
}));

describe("/api/embedding-providers route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    resolveAstraConnectionMock.mockReturnValue({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
    });
  });

  it("validates the required Astra connection", async () => {
    resolveAstraConnectionMock.mockReturnValueOnce({
      token: "",
      endpoint: "",
      keyspace: "default_keyspace",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/embedding-providers", {
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

  it("flattens provider models into the response shape used by the UI", async () => {
    findEmbeddingProvidersMock.mockResolvedValueOnce({
      embeddingProviders: {
        nvidia: {
          displayName: "NVIDIA",
          models: [{ name: "NV-Embed-QA", vectorDimension: 1024 }],
        },
        huggingface: {
          displayName: "Hugging Face",
          models: [{ name: "granite-embedding", vectorDimension: 768 }],
        },
      },
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/embedding-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as never
    );

    expect(await response.json()).toEqual({
      models: [
        {
          provider: "nvidia",
          providerDisplayName: "NVIDIA",
          modelName: "NV-Embed-QA",
          vectorDimension: 1024,
        },
        {
          provider: "huggingface",
          providerDisplayName: "Hugging Face",
          modelName: "granite-embedding",
          vectorDimension: 768,
        },
      ],
    });
  });

  it("returns 500 when provider discovery fails", async () => {
    findEmbeddingProvidersMock.mockRejectedValueOnce(new Error("provider lookup failed"));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/embedding-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "provider lookup failed",
    });
  });
});
