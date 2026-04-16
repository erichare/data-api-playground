import { describe, expect, it } from "vitest";
import {
  getActiveAiSummary,
  getAstraConfigMode,
  getBackendSummary,
  getModelFamilyLabel,
  shouldDefaultToAstraCli,
} from "@/components/connection/utils";

describe("connection utils", () => {
  describe("shouldDefaultToAstraCli", () => {
    it("returns true only when CLI is available, configured, has a profile, and a database", () => {
      expect(shouldDefaultToAstraCli(null)).toBe(false);
      expect(
        shouldDefaultToAstraCli({
          available: true,
          configured: true,
          selectedProfile: "default",
          databases: [{ id: "db1", name: "n", endpoint: "e", region: "r" }],
          profiles: [],
        } as never)
      ).toBe(true);
      expect(
        shouldDefaultToAstraCli({
          available: true,
          configured: true,
          selectedProfile: "",
          databases: [{ id: "db1", name: "n", endpoint: "e", region: "r" }],
          profiles: [],
        } as never)
      ).toBe(false);
    });
  });

  describe("getAstraConfigMode", () => {
    it("returns astra-cli only for fromAstraCli connections", () => {
      expect(getAstraConfigMode(null)).toBe("credentials");
      expect(
        getAstraConfigMode({ backend: "astra", token: "t", endpoint: "e" } as never)
      ).toBe("credentials");
      expect(
        getAstraConfigMode({
          backend: "astra",
          token: "",
          endpoint: "",
          fromAstraCli: true,
        } as never)
      ).toBe("astra-cli");
    });
  });

  describe("getBackendSummary", () => {
    it("returns env fallback for null connection", () => {
      expect(getBackendSummary(null)).toBe("Managed by server environment");
    });

    it("masks the astra token", () => {
      expect(
        getBackendSummary({
          backend: "astra",
          token: "AstraCS:abc123def456ghi",
          endpoint: "e",
        } as never)
      ).toMatch(/AstraCS:•/);
    });

    it("describes Astra CLI connections", () => {
      expect(
        getBackendSummary({
          backend: "astra",
          token: "",
          endpoint: "",
          fromAstraCli: true,
          astraCliDatabase: "prod",
          astraCliProfile: "main",
        } as never)
      ).toBe("Astra CLI · prod · main");
    });

    it("describes hcd connections", () => {
      expect(
        getBackendSummary({
          backend: "hcd",
          username: "cassandra",
          endpoint: "https://hcd",
          password: "p",
        } as never)
      ).toBe("cassandra @ https://hcd");
    });
  });

  describe("getModelFamilyLabel", () => {
    it("strips org prefix, instruct/chat suffix, and size suffixes", () => {
      expect(getModelFamilyLabel("Qwen/Qwen2.5-Coder-32B-Instruct")).toBe("Qwen2.5-Coder");
      expect(getModelFamilyLabel("granite3.1-dense:8b")).toBe("granite3.1-dense");
      expect(getModelFamilyLabel("mistral-7b")).toBe("mistral");
      expect(getModelFamilyLabel(null)).toBe("Checking...");
      expect(getModelFamilyLabel("")).toBe("Checking...");
    });

    it("keeps non-size trailing tokens", () => {
      expect(getModelFamilyLabel("foo-bar")).toBe("foo-bar");
    });
  });

  describe("getActiveAiSummary", () => {
    it("highlights manual key when provided", () => {
      const summary = getActiveAiSummary(null, "  hf_x  ");
      expect(summary.label).toBe("Hugging Face via manual key");
    });

    it("falls back to ollama when reachable and models installed", () => {
      const summary = getActiveAiSummary(
        {
          hasHuggingFaceEnvKey: false,
          ollamaReachable: true,
          ollamaBaseUrl: "http://x",
          chatModelInstalled: true,
          embedModelInstalled: true,
          huggingfaceChatModel: "h",
          huggingfaceEmbedModel: "h",
          ollamaChatModel: "c",
          ollamaEmbedModel: "e",
        },
        ""
      );
      expect(summary.label).toBe("Ollama local fallback");
      expect(summary.detail).toContain("Ready locally");
    });

    it("warns when ollama is unreachable", () => {
      const summary = getActiveAiSummary(
        {
          hasHuggingFaceEnvKey: false,
          ollamaReachable: false,
          ollamaBaseUrl: "http://x",
          chatModelInstalled: false,
          embedModelInstalled: false,
          huggingfaceChatModel: "h",
          huggingfaceEmbedModel: "h",
          ollamaChatModel: "c",
          ollamaEmbedModel: "e",
        },
        ""
      );
      expect(summary.detail).toContain("not reachable");
    });
  });
});
