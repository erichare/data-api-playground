import { describe, expect, it } from "vitest";
import {
  parsePortablePlaygroundConfig,
  stringifyPortablePlaygroundConfig,
} from "@/lib/config/portableConfig";

describe("portable playground config", () => {
  it("serializes and parses a manual Data API config", () => {
    const yaml = stringifyPortablePlaygroundConfig({
      selectedBackend: "astra",
      astraConfigMode: "credentials",
      astraToken: "AstraCS:manual",
      astraEndpoint: "https://db.apps.astra.datastax.com",
      astraCliProfile: "",
      astraCliDatabase: "",
      hcdEndpoint: "",
      hcdUsername: "",
      hcdPassword: "",
      knowledgeBackendMode: "openrag",
      openragApiKey: "orag_manual",
      openragBaseUrl: "https://openrag.example.com",
      huggingfaceApiKey: "hf_manual",
    });

    expect(yaml).toContain("dataBackend:");
    expect(parsePortablePlaygroundConfig(yaml)).toEqual({
      selectedBackend: "astra",
      astraConfigMode: "credentials",
      astraToken: "AstraCS:manual",
      astraEndpoint: "https://db.apps.astra.datastax.com",
      astraCliProfile: "",
      astraCliDatabase: "",
      hcdEndpoint: "",
      hcdUsername: "",
      hcdPassword: "",
      knowledgeBackendMode: "openrag",
      openragApiKey: "orag_manual",
      openragBaseUrl: "https://openrag.example.com",
      huggingfaceApiKey: "hf_manual",
    });
  });

  it("parses a CLI-backed JSON config export", () => {
    expect(
      parsePortablePlaygroundConfig(
        JSON.stringify({
          version: 1,
          dataBackend: {
            backend: "astra",
            source: "astra-cli",
            profile: "default",
            database: "db-123",
          },
          knowledgeBackend: {
            mode: "connected",
          },
          ai: {
            huggingFace: {
              source: "env",
            },
          },
        })
      )
    ).toEqual({
      selectedBackend: "astra",
      astraConfigMode: "astra-cli",
      astraToken: "",
      astraEndpoint: "",
      astraCliProfile: "default",
      astraCliDatabase: "db-123",
      hcdEndpoint: "",
      hcdUsername: "",
      hcdPassword: "",
      knowledgeBackendMode: "connected",
      openragApiKey: "",
      openragBaseUrl: "",
      huggingfaceApiKey: "",
    });
  });
});
