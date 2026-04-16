import { describe, expect, it } from "vitest";
import {
  appendKnowledgeFormData,
  buildKnowledgeRequestBody,
} from "@/lib/knowledge/client";

describe("knowledge client helpers", () => {
  it("omits extra payload fields when the connected backend is active", () => {
    expect(
      buildKnowledgeRequestBody({
        selectedBackend: "astra",
        knowledgeBackendMode: "connected",
        openragConnection: null,
      })
    ).toEqual({});
  });

  it("builds an OpenRAG payload from manual credentials", () => {
    expect(
      buildKnowledgeRequestBody({
        selectedBackend: "hcd",
        knowledgeBackendMode: "openrag",
        openragConnection: {
          kind: "openrag",
          apiKey: "orag_secret",
          baseUrl: "https://openrag.example.com",
        },
      })
    ).toEqual({
      knowledgeBackend: "openrag",
      openragApiKey: "orag_secret",
      openragBaseUrl: "https://openrag.example.com",
    });
  });

  it("omits manual OpenRAG fields when the connection is env-backed", () => {
    expect(
      buildKnowledgeRequestBody({
        selectedBackend: "astra",
        knowledgeBackendMode: "openrag",
        openragConnection: {
          kind: "openrag",
          apiKey: "",
          baseUrl: "",
          fromEnv: true,
        },
      })
    ).toEqual({
      knowledgeBackend: "openrag",
    });
  });

  it("appends only non-empty knowledge fields to multipart form data", () => {
    const formData = new FormData();

    appendKnowledgeFormData(formData, {
      selectedBackend: "astra",
      knowledgeBackendMode: "openrag",
      openragConnection: {
        kind: "openrag",
        apiKey: "orag_secret",
        baseUrl: "",
      },
    });

    expect(formData.get("knowledgeBackend")).toBe("openrag");
    expect(formData.get("openragApiKey")).toBe("orag_secret");
    expect(formData.get("openragBaseUrl")).toBeNull();
  });
});
