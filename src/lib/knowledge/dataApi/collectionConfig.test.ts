import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/astra", () => ({
  SYSTEM_FIELDS: new Set(["_id", "$vector", "$vectorize"]),
}));

import {
  docPreview,
  getBackendHint,
  getCollectionConfig,
  mapCollectionDescriptionToSource,
  validateVectorDimension,
} from "@/lib/knowledge/dataApi/collectionConfig";

describe("collectionConfig", () => {
  describe("docPreview", () => {
    it("skips system fields and stops after four primitives", () => {
      const preview = docPreview({
        _id: "abc",
        $vector: [1],
        title: "hello",
        score: 9,
        active: true,
        nested: { ignored: true },
        extra1: "x",
        extra2: "y",
        extra3: "z",
      });
      expect(preview).toEqual({
        title: "hello",
        score: 9,
        active: "true",
        extra1: "x",
      });
      expect(Object.keys(preview)).toHaveLength(4);
    });
  });

  describe("mapCollectionDescriptionToSource", () => {
    it("flattens vector + vectorize service metadata", () => {
      expect(
        mapCollectionDescriptionToSource({
          name: "docs",
          definition: {
            vector: {
              dimension: 1024,
              service: { provider: "openai", modelName: "text-embedding-3" },
            },
          },
        } as never)
      ).toEqual({
        name: "docs",
        vectorDimension: 1024,
        vectorizeProvider: "openai",
        vectorizeModel: "text-embedding-3",
      });
    });
  });

  describe("getCollectionConfig", () => {
    it("returns server-side defaults when no source is given", () => {
      expect(getCollectionConfig(undefined)).toEqual({
        useVectorize: false,
        vectorDimension: null,
        vectorizeProvider: "astra",
        vectorizeModel: "server-side vectorize",
      });
    });

    it("treats the presence of a vectorize provider as useVectorize", () => {
      expect(
        getCollectionConfig({
          name: "docs",
          vectorDimension: 1536,
          vectorizeProvider: "openai",
          vectorizeModel: "embed-3",
        })
      ).toEqual({
        useVectorize: true,
        vectorDimension: 1536,
        vectorizeProvider: "openai",
        vectorizeModel: "embed-3",
      });
    });
  });

  describe("getBackendHint", () => {
    it("prefers the vectorize service when present", () => {
      expect(
        getBackendHint(
          {
            name: "docs",
            vectorDimension: 1024,
            vectorizeProvider: "openai",
            vectorizeModel: "embed-3",
          },
          { provider: "huggingface", embedModel: "ignored" } as never
        )
      ).toEqual({ provider: "openai", model: "embed-3" });
    });

    it("falls back to the resolved AI backend when no vectorize service is set", () => {
      expect(
        getBackendHint(
          {
            name: "docs",
            vectorDimension: null,
            vectorizeProvider: null,
            vectorizeModel: null,
          },
          { provider: "ollama", embedModel: "granite" } as never
        )
      ).toEqual({ provider: "ollama", model: "granite" });
    });

    it("returns 'unknown' when neither is available", () => {
      expect(
        getBackendHint(
          {
            name: "docs",
            vectorDimension: null,
            vectorizeProvider: null,
            vectorizeModel: null,
          },
          null
        )
      ).toEqual({ provider: "unknown", model: "unknown" });
    });
  });

  describe("validateVectorDimension", () => {
    it("throws on a dimension mismatch", () => {
      expect(() =>
        validateVectorDimension({
          collection: "docs",
          expected: 1024,
          embeddings: [[1, 2, 3]],
        })
      ).toThrow("expects 1024d");
    });

    it("is a no-op when the expected dimension is null or no embeddings exist", () => {
      expect(() =>
        validateVectorDimension({ collection: "docs", expected: null, embeddings: [[1]] })
      ).not.toThrow();
      expect(() =>
        validateVectorDimension({ collection: "docs", expected: 1024, embeddings: [] })
      ).not.toThrow();
    });
  });
});
