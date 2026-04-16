import { afterEach, describe, expect, it } from "vitest";
import { getKnowledgeBackendStatuses } from "@/lib/knowledge/server";

describe("getKnowledgeBackendStatuses", () => {
  const originalApiKey = process.env.OPENRAG_API_KEY;
  const originalUrl = process.env.OPENRAG_URL;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENRAG_API_KEY;
    } else {
      process.env.OPENRAG_API_KEY = originalApiKey;
    }

    if (originalUrl === undefined) {
      delete process.env.OPENRAG_URL;
    } else {
      process.env.OPENRAG_URL = originalUrl;
    }
  });

  it("reports OpenRAG readiness from environment variables", () => {
    process.env.OPENRAG_API_KEY = "orag_secret";
    process.env.OPENRAG_URL = "https://openrag.example.com";

    expect(getKnowledgeBackendStatuses()).toEqual({
      openrag: {
        kind: "openrag",
        ready: true,
        hasApiKey: true,
        hasBaseUrl: true,
      },
    });
  });

  it("treats the API key as the only required env var", () => {
    delete process.env.OPENRAG_URL;
    process.env.OPENRAG_API_KEY = "orag_secret";

    expect(getKnowledgeBackendStatuses().openrag).toEqual({
      kind: "openrag",
      ready: true,
      hasApiKey: true,
      hasBaseUrl: false,
    });
  });
});
