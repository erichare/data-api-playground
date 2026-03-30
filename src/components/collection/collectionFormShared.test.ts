import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCollection, fetchProviderModels } from "./collectionFormShared";

describe("collection form helpers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns a demo collection when Astra is not connected", async () => {
    await expect(
      createCollection({
        name: "demo_docs",
        mode: "vectorize",
        dimension: 768,
        metric: "cosine",
        selectedModel: {
          provider: "nvidia",
          providerDisplayName: "NVIDIA",
          modelName: "NV-Embed-QA",
          vectorDimension: 1024,
        },
      })
    ).resolves.toEqual({
      name: "demo_docs",
      count: 0,
      vectorDim: null,
      vectorizeService: {
        provider: "nvidia",
        modelName: "NV-Embed-QA",
      },
    });
  });

  it("loads provider models from the API", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            provider: "nvidia",
            providerDisplayName: "NVIDIA",
            modelName: "NV-Embed-QA",
            vectorDimension: 1024,
          },
        ],
      }),
    }) as typeof fetch;

    await expect(fetchProviderModels("token", "endpoint")).resolves.toEqual([
      {
        provider: "nvidia",
        providerDisplayName: "NVIDIA",
        modelName: "NV-Embed-QA",
        vectorDimension: 1024,
      },
    ]);
  });

  it("submits collection creation through the API when connected", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        collection: {
          name: "customer_docs",
          count: 0,
          vectorDim: 1536,
          vectorizeService: null,
        },
      }),
    }) as typeof fetch;

    await expect(
      createCollection({
        astraToken: "token",
        astraEndpoint: "endpoint",
        keyspace: "ks1",
        isConnected: true,
        name: "customer_docs",
        mode: "client",
        dimension: 1536,
        metric: "dot_product",
        selectedModel: null,
      })
    ).resolves.toEqual({
      name: "customer_docs",
      count: 0,
      vectorDim: 1536,
      vectorizeService: null,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/create-collection",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
  });
});
