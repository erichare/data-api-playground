import { afterEach, describe, expect, it } from "vitest";
import { getOllamaBaseUrl } from "./config";

const originalOllamaBaseUrl = process.env.OLLAMA_BASE_URL;

describe("getOllamaBaseUrl", () => {
  afterEach(() => {
    if (originalOllamaBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = originalOllamaBaseUrl;
  });

  it("returns the default URL when OLLAMA_BASE_URL is not set", () => {
    delete process.env.OLLAMA_BASE_URL;
    expect(getOllamaBaseUrl()).toBe("http://127.0.0.1:11434");
  });

  it("strips trailing slashes from the configured URL", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434///";
    expect(getOllamaBaseUrl()).toBe("http://localhost:11434");
  });

  it("accepts https URLs", () => {
    process.env.OLLAMA_BASE_URL = "https://ollama.internal:11434";
    expect(getOllamaBaseUrl()).toBe("https://ollama.internal:11434");
  });

  it("rejects non-http protocols to prevent SSRF", () => {
    process.env.OLLAMA_BASE_URL = "file:///etc/passwd";
    expect(() => getOllamaBaseUrl()).toThrow("must use http or https protocol");
  });

  it("rejects ftp protocol", () => {
    process.env.OLLAMA_BASE_URL = "ftp://evil.com/payload";
    expect(() => getOllamaBaseUrl()).toThrow("must use http or https protocol");
  });

  it("rejects invalid URLs", () => {
    process.env.OLLAMA_BASE_URL = "not a url at all";
    expect(() => getOllamaBaseUrl()).toThrow("not a valid URL");
  });
});
