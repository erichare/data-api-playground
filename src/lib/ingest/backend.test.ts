import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveBackendMock,
  getAstraDbMock,
  buildTsCallMock,
  formatTsMethodCallMock,
  recordAstraClientCallMock,
} = vi.hoisted(() => ({
  resolveBackendMock: vi.fn(),
  getAstraDbMock: vi.fn(),
  buildTsCallMock: vi.fn(),
  formatTsMethodCallMock: vi.fn(),
  recordAstraClientCallMock: vi.fn(),
}));

vi.mock("@/lib/ai/service", () => ({
  resolveBackend: resolveBackendMock,
}));

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
}));

vi.mock("@/lib/astraClientLog", () => ({
  buildTsCall: buildTsCallMock,
  formatTsMethodCall: formatTsMethodCallMock,
  recordAstraClientCall: recordAstraClientCallMock,
}));

import {
  getBackendHint,
  getCollectionConfig,
  resolveIngestCollectionContext,
  validateVectorDimension,
} from "./backend";

describe("ingest backend helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts vectorize configuration from a collection description", () => {
    expect(
      getCollectionConfig({
        name: "orders",
        definition: {
          vector: {
            dimension: 1536,
            service: {
              provider: "openai",
              modelName: "text-embedding-3-small",
            },
          },
        },
      })
    ).toEqual({
      useVectorize: true,
      vectorDimension: 1536,
      vectorizeProvider: "openai",
      vectorizeModel: "text-embedding-3-small",
    });

    expect(getCollectionConfig(undefined)).toEqual({
      useVectorize: false,
      vectorDimension: null,
      vectorizeProvider: "astra",
      vectorizeModel: "server-side vectorize",
    });
  });

  it("prefers vectorize metadata and falls back to unknown when no backend is present", () => {
    expect(
      getBackendHint(
        {
          name: "orders",
          definition: {
            vector: {
              service: {
                provider: "openai",
                modelName: "text-embedding-3-small",
              },
            },
          },
        },
        {
          provider: "huggingface",
          source: "env",
          huggingfaceApiKey: "",
          huggingFaceKeyPresent: true,
          chatModel: "chat-model",
          embedModel: "embed-model",
          ollamaBaseUrl: "http://127.0.0.1:11434",
        }
      )
    ).toEqual({
      provider: "openai",
      model: "text-embedding-3-small",
    });

    expect(getBackendHint(undefined, null)).toEqual({
      provider: "unknown",
      model: "unknown",
    });
  });

  it("validates vector dimensions only when an expected size is available", () => {
    expect(() =>
      validateVectorDimension({
        collection: "orders",
        expected: null,
        embeddings: [],
      })
    ).not.toThrow();

    expect(() =>
      validateVectorDimension({
        collection: "orders",
        expected: 3,
        embeddings: [[0.1, 0.2]],
      })
    ).toThrowError(
      'Embedding dimension mismatch for "orders": collection expects 3d but active model returned 2d'
    );
  });

  it("resolves non-vectorize collection context through Astra and the shared backend", async () => {
    const collection = { insertMany: vi.fn() };
    const db = {
      collection: vi.fn(() => collection),
      listCollections: vi.fn(async () => [
        {
          name: "orders",
          definition: { vector: { dimension: 768 } },
        },
      ]),
    };
    getAstraDbMock.mockReturnValue(db);
    buildTsCallMock.mockReturnValue("db.listCollections({ nameOnly: false })");
    formatTsMethodCallMock.mockReturnValue("listCollections({ nameOnly: false })");
    resolveBackendMock.mockReturnValue({
      provider: "huggingface",
      source: "manual",
      huggingfaceApiKey: "hf-key",
      huggingFaceKeyPresent: true,
      chatModel: "chat-model",
      embedModel: "embed-model",
      ollamaBaseUrl: "http://127.0.0.1:11434",
    });

    const context = await resolveIngestCollectionContext({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
      collectionName: "orders",
      huggingfaceApiKey: "hf-key",
    });

    expect(getAstraDbMock).toHaveBeenCalledWith(
      "AstraCS:secret",
      "https://db.apps.astra.datastax.com",
      "default_keyspace"
    );
    expect(resolveBackendMock).toHaveBeenCalledWith({ huggingfaceApiKey: "hf-key" });
    expect(recordAstraClientCallMock).toHaveBeenCalledWith({
      label: "Inspect Collection Config",
      code: "db.listCollections({ nameOnly: false })",
    });
    expect(context.collection).toBe(collection);
    expect(context.collectionConfig.useVectorize).toBe(false);
    expect(context.backendHint).toEqual({
      provider: "huggingface",
      model: "embed-model",
    });
  });

  it("skips backend resolution for server-side vectorize collections", async () => {
    const collection = { insertMany: vi.fn() };
    const db = {
      collection: vi.fn(() => collection),
      listCollections: vi.fn(async () => [
        {
          name: "orders",
          definition: {
            vector: {
              service: {
                provider: "openai",
                modelName: "text-embedding-3-small",
              },
            },
          },
        },
      ]),
    };
    getAstraDbMock.mockReturnValue(db);
    buildTsCallMock.mockReturnValue("db.listCollections({ nameOnly: false })");
    formatTsMethodCallMock.mockReturnValue("listCollections({ nameOnly: false })");

    const context = await resolveIngestCollectionContext({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      collectionName: "orders",
    });

    expect(resolveBackendMock).not.toHaveBeenCalled();
    expect(context.backend).toBeNull();
    expect(context.collectionConfig.useVectorize).toBe(true);
    expect(context.backendHint).toEqual({
      provider: "openai",
      model: "text-embedding-3-small",
    });
  });
});
