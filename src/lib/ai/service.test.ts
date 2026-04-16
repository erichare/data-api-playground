/* eslint-disable security/detect-object-injection -- Test helpers intentionally exercise typed backend maps with fixture-controlled keys. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  embedMany,
  ensureModel,
  generateText,
  getAiStatus,
  isOllamaModelInstalled,
  resolveBackend,
  streamText,
} from "./service";

const ENV_KEYS = [
  "HUGGINGFACE_API_KEY",
  "HUGGINGFACE_CHAT_MODEL",
  "HUGGINGFACE_EMBED_MODEL",
  "OLLAMA_BASE_URL",
  "OLLAMA_CHAT_MODEL",
  "OLLAMA_EMBED_MODEL",
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function ndjsonResponse(events: Array<Record<string, unknown>>) {
  const encoder = new TextEncoder();
  const payload = events.map((event) => JSON.stringify(event)).join("\n") + "\n";

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    }),
    {
      headers: { "Content-Type": "application/x-ndjson" },
    }
  );
}

function sseResponse(events: string[]) {
  const encoder = new TextEncoder();
  const payload = events.map((event) => `data: ${event}\n\n`).join("") + "data: [DONE]\n\n";

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    }),
    {
      headers: { "Content-Type": "text/event-stream" },
    }
  );
}

describe("ai service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe("resolveBackend", () => {
    it("prefers a manual Hugging Face key over env and local fallback", () => {
      process.env.HUGGINGFACE_API_KEY = "env-key";

      const backend = resolveBackend({ huggingfaceApiKey: "  manual-key  " });

      expect(backend).toMatchObject({
        provider: "huggingface",
        source: "manual",
        huggingfaceApiKey: "manual-key",
        huggingFaceKeyPresent: true,
      });
    });

    it("uses the env Hugging Face key when no manual key is provided", () => {
      process.env.HUGGINGFACE_API_KEY = "env-key";

      const backend = resolveBackend({});

      expect(backend).toMatchObject({
        provider: "huggingface",
        source: "env",
        huggingfaceApiKey: "env-key",
      });
    });

    it("falls back to local Ollama when no Hugging Face key is configured", () => {
      process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";

      const backend = resolveBackend({});

      expect(backend).toMatchObject({
        provider: "ollama",
        source: "local",
        huggingFaceKeyPresent: false,
        ollamaBaseUrl: "http://127.0.0.1:11434",
      });
    });
  });

  describe("getAiStatus", () => {
    it("reports env Hugging Face availability and installed Ollama models", async () => {
      process.env.HUGGINGFACE_API_KEY = "env-key";
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({
          models: [
            { name: "granite3.1-dense:8b" },
            { name: "granite-embedding:278m" },
          ],
        })
      );

      await expect(getAiStatus()).resolves.toMatchObject({
        hasHuggingFaceEnvKey: true,
        ollamaReachable: true,
        chatModelInstalled: true,
        embedModelInstalled: true,
        huggingfaceChatModel: "Qwen/Qwen2.5-Coder-32B-Instruct",
        huggingfaceEmbedModel: "ibm-granite/granite-embedding-125m-english",
        ollamaChatModel: "granite3.1-dense:8b",
        ollamaEmbedModel: "granite-embedding:278m",
      });
    });

    it("treats Ollama as unavailable when tags cannot be listed", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ message: "down" }, { status: 503 })
      );

      await expect(getAiStatus()).resolves.toMatchObject({
        hasHuggingFaceEnvKey: false,
        ollamaReachable: false,
        chatModelInstalled: false,
        embedModelInstalled: false,
        huggingfaceChatModel: "Qwen/Qwen2.5-Coder-32B-Instruct",
        huggingfaceEmbedModel: "ibm-granite/granite-embedding-125m-english",
        ollamaChatModel: "granite3.1-dense:8b",
        ollamaEmbedModel: "granite-embedding:278m",
      });
    });
  });

  describe("ensureModel", () => {
    it("returns immediately for non-Ollama backends", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });

      await expect(
        ensureModel({ backend, kind: "chat", allowPull: true })
      ).resolves.toEqual({
        downloaded: false,
        model: "Qwen/Qwen2.5-Coder-32B-Instruct",
      });
    });

    it("reports already-installed Ollama models without downloading", async () => {
      const backend = resolveBackend({});
      const onProgress = vi.fn();
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ models: [{ name: "granite3.1-dense:8b" }] })
      );

      await expect(
        ensureModel({ backend, kind: "chat", allowPull: true, onProgress })
      ).resolves.toEqual({
        downloaded: false,
        model: "granite3.1-dense:8b",
      });

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "ollama",
          kind: "chat",
          model: "granite3.1-dense:8b",
          status: "Model already installed",
          determinate: false,
        })
      );
    });

    it("errors when an Ollama model is missing and pulling is disabled", async () => {
      const backend = resolveBackend({});
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ models: [] }));

      await expect(
        ensureModel({ backend, kind: "embed", allowPull: false })
      ).rejects.toThrow(
        'Ollama model "granite-embedding:278m" is not installed. Run "ollama pull granite-embedding:278m" or use a Hugging Face key.'
      );
    });

    it("streams Ollama pull progress when a model must be downloaded", async () => {
      const backend = resolveBackend({});
      const onProgress = vi.fn();
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse({ models: [] }))
        .mockResolvedValueOnce(
          ndjsonResponse([
            {
              status: "pulling manifest",
              completed: 256,
              total: 1024,
            },
            { status: "success" },
          ])
        );

      await expect(
        ensureModel({ backend, kind: "chat", allowPull: true, onProgress })
      ).resolves.toEqual({
        downloaded: true,
        model: "granite3.1-dense:8b",
      });

      expect(onProgress).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          status: "pulling manifest",
          completed: 256,
          total: 1024,
          determinate: true,
        })
      );
      expect(onProgress).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          status: "success",
          determinate: false,
        })
      );
    });

    it("throws when the Ollama pull API returns an error status", async () => {
      const backend = resolveBackend({});
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse({ models: [] }))
        .mockResolvedValueOnce(
          jsonResponse({ error: "connection refused" }, { status: 500 })
        );

      await expect(
        ensureModel({ backend, kind: "chat", allowPull: true })
      ).rejects.toThrow("Ollama 500:");
    });

    it("returns the embed model name for non-Ollama embed backends", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });

      await expect(
        ensureModel({ backend, kind: "embed", allowPull: true })
      ).resolves.toEqual({
        downloaded: false,
        model: "ibm-granite/granite-embedding-125m-english",
      });
    });
  });

  describe("generateText", () => {
    it("calls the Hugging Face router with the configured chat model", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "  Hello there  " } }],
        })
      );

      const result = await generateText({
        backend,
        messages: [{ role: "user", content: "Hi" }],
        maxTokens: 64,
      });

      expect(result).toEqual({
        content: "Hello there",
        provider: "huggingface",
        model: "Qwen/Qwen2.5-Coder-32B-Instruct",
      });

      const [, options] = vi.mocked(fetch).mock.calls[0];
      expect(options?.body).toContain(
        '"model":"Qwen/Qwen2.5-Coder-32B-Instruct"'
      );
    });

    it("uses Ollama after ensuring the local chat model is installed", async () => {
      const backend = resolveBackend({});
      const onPrepareProgress = vi.fn();
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse({ models: [{ name: "granite3.1-dense:8b" }] })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            choices: [{ message: { content: "Ollama response" } }],
          })
        );

      const result = await generateText({
        backend,
        messages: [{ role: "user", content: "Hello" }],
        maxTokens: 32,
        onPrepareProgress,
      });

      expect(result).toEqual({
        content: "Ollama response",
        provider: "ollama",
        model: "granite3.1-dense:8b",
      });
      expect(onPrepareProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: "Model already installed" })
      );
    });

    it("throws on empty Hugging Face chat responses", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: "" } }] })
      );

      await expect(
        generateText({
          backend,
          messages: [{ role: "user", content: "Hi" }],
          maxTokens: 16,
        })
      ).rejects.toThrow("Hugging Face returned an empty chat response");
    });

    it("throws on empty Ollama chat responses", async () => {
      const backend = resolveBackend({});
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse({ models: [{ name: "granite3.1-dense:8b" }] })
        )
        .mockResolvedValueOnce(
          jsonResponse({ choices: [{ message: { content: "" } }] })
        );

      await expect(
        generateText({
          backend,
          messages: [{ role: "user", content: "Hello" }],
          maxTokens: 32,
        })
      ).rejects.toThrow("Ollama returned an empty chat response");
    });

    it("surfaces Ollama HTTP errors in generateText", async () => {
      const backend = resolveBackend({});
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse({ models: [{ name: "granite3.1-dense:8b" }] })
        )
        .mockResolvedValueOnce(
          jsonResponse({ error: "service overloaded" }, { status: 503 })
        );

      await expect(
        generateText({
          backend,
          messages: [{ role: "user", content: "Hello" }],
          maxTokens: 32,
        })
      ).rejects.toThrow("Ollama 503:");
    });

    it("surfaces provider errors when Hugging Face rejects the request", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ error: "Bad token" }, { status: 401 })
      );

      await expect(
        generateText({
          backend,
          messages: [{ role: "user", content: "Hi" }],
          maxTokens: 16,
        })
      ).rejects.toThrow("Hugging Face 401: Bad token");
    });
  });

  describe("streamText", () => {
    it("streams Hugging Face router chunks through the callback", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });
      const onChunk = vi.fn();
      vi.mocked(fetch).mockResolvedValueOnce(
        sseResponse([
          JSON.stringify({ choices: [{ delta: { content: "Hello" } }] }),
          JSON.stringify({ choices: [{ delta: { content: " there" } }] }),
        ])
      );

      const result = await streamText({
        backend,
        messages: [{ role: "user", content: "Hi" }],
        maxTokens: 64,
        onChunk,
      });

      expect(result).toEqual({
        content: "Hello there",
        provider: "huggingface",
        model: "Qwen/Qwen2.5-Coder-32B-Instruct",
      });
      expect(onChunk).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ delta: "Hello", content: "Hello" })
      );
      expect(onChunk).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ delta: " there", content: "Hello there" })
      );
    });

    it("throws on empty Hugging Face streamed responses", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });
      vi.mocked(fetch).mockResolvedValueOnce(
        sseResponse([])
      );

      await expect(
        streamText({
          backend,
          messages: [{ role: "user", content: "Hi" }],
          maxTokens: 16,
          onChunk: vi.fn(),
        })
      ).rejects.toThrow("Hugging Face returned an empty chat response");
    });

    it("surfaces Hugging Face HTTP errors in streamText", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ error: "unauthorized" }, { status: 401 })
      );

      await expect(
        streamText({
          backend,
          messages: [{ role: "user", content: "Hi" }],
          maxTokens: 16,
          onChunk: vi.fn(),
        })
      ).rejects.toThrow("Hugging Face 401:");
    });

    it("throws on empty Ollama streamed responses", async () => {
      const backend = resolveBackend({});
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse({ models: [{ name: "granite3.1-dense:8b" }] })
        )
        .mockResolvedValueOnce(sseResponse([]));

      await expect(
        streamText({
          backend,
          messages: [{ role: "user", content: "Hello" }],
          maxTokens: 32,
          onChunk: vi.fn(),
        })
      ).rejects.toThrow("Ollama returned an empty chat response");
    });

    it("surfaces Ollama HTTP errors in streamText", async () => {
      const backend = resolveBackend({});
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse({ models: [{ name: "granite3.1-dense:8b" }] })
        )
        .mockResolvedValueOnce(
          jsonResponse({ error: "overloaded" }, { status: 503 })
        );

      await expect(
        streamText({
          backend,
          messages: [{ role: "user", content: "Hello" }],
          maxTokens: 32,
          onChunk: vi.fn(),
        })
      ).rejects.toThrow("Ollama 503:");
    });

    it("streams Ollama chunks after ensuring the model is installed", async () => {
      const backend = resolveBackend({});
      const onChunk = vi.fn();
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse({ models: [{ name: "granite3.1-dense:8b" }] })
        )
        .mockResolvedValueOnce(
          sseResponse([
            JSON.stringify({ choices: [{ delta: { content: "Local" } }] }),
            JSON.stringify({ choices: [{ delta: { content: " reply" } }] }),
          ])
        );

      const result = await streamText({
        backend,
        messages: [{ role: "user", content: "Hello" }],
        maxTokens: 32,
        onChunk,
      });

      expect(result).toEqual({
        content: "Local reply",
        provider: "ollama",
        model: "granite3.1-dense:8b",
      });
      expect(onChunk).toHaveBeenLastCalledWith(
        expect.objectContaining({ content: "Local reply", delta: " reply" })
      );
    });
  });

  describe("embedMany", () => {
    it("normalizes nested Hugging Face embedding payloads", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse([[[0.1, 0.2, 0.3]], [[0.4, 0.5, 0.6]]])
      );

      await expect(embedMany({ backend, input: ["a", "b"] })).resolves.toEqual({
        embeddings: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ],
        provider: "huggingface",
        model: "ibm-granite/granite-embedding-125m-english",
      });
    });

    it("rejects invalid Hugging Face embedding payloads", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));

      await expect(embedMany({ backend, input: ["a"] })).rejects.toThrow(
        "Hugging Face returned an invalid embedding payload"
      );
    });

    it("ensures the Ollama embed model before generating embeddings", async () => {
      const backend = resolveBackend({});
      const onPrepareProgress = vi.fn();
      const onPrepared = vi.fn();
      vi.mocked(fetch)
        // ensureModel → listOllamaModels
        .mockResolvedValueOnce(
          jsonResponse({ models: [{ name: "granite-embedding:278m" }] })
        )
        // actual embed call
        .mockResolvedValueOnce(
          jsonResponse({ embeddings: [[0.1, 0.2, 0.3]] })
        );

      const result = await embedMany({
        backend,
        input: ["hello"],
        skipEnsure: false,
        onPrepareProgress,
        onPrepared,
      });

      expect(result).toEqual({
        embeddings: [[0.1, 0.2, 0.3]],
        provider: "ollama",
        model: "granite-embedding:278m",
      });
      expect(onPrepareProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: "Model already installed" })
      );
      expect(onPrepared).toHaveBeenCalled();
    });

    it("surfaces errors when Ollama embed API rejects", async () => {
      const backend = resolveBackend({});
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse({ models: [{ name: "granite-embedding:278m" }] })
        )
        .mockResolvedValueOnce(
          jsonResponse({ error: "model not found" }, { status: 404 })
        );

      await expect(
        embedMany({ backend, input: ["hello"] })
      ).rejects.toThrow("Ollama 404:");
    });

    it("rejects invalid Ollama embedding payloads", async () => {
      const backend = resolveBackend({});
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          jsonResponse({ models: [{ name: "granite-embedding:278m" }] })
        )
        .mockResolvedValueOnce(
          jsonResponse({ embeddings: [] })
        );

      await expect(
        embedMany({ backend, input: ["hello"] })
      ).rejects.toThrow("Ollama returned an invalid embedding payload");
    });

    it("handles flat Hugging Face embedding response (single input)", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse([0.1, 0.2, 0.3])
      );

      const result = await embedMany({ backend, input: ["hello"] });
      expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
    });

    it("surfaces errors when Hugging Face embed API rejects", async () => {
      const backend = resolveBackend({ huggingfaceApiKey: "manual-key" });
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ error: "rate limited" }, { status: 429 })
      );

      await expect(
        embedMany({ backend, input: ["hello"] })
      ).rejects.toThrow("Hugging Face 429:");
    });

    it("supports Ollama embeddings without re-checking the model when skipEnsure is true", async () => {
      const backend = resolveBackend({});
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ embeddings: [[0.9, 0.8, 0.7]] })
      );

      await expect(
        embedMany({ backend, input: ["hello"], skipEnsure: true })
      ).resolves.toEqual({
        embeddings: [[0.9, 0.8, 0.7]],
        provider: "ollama",
        model: "granite-embedding:278m",
      });

      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("isOllamaModelInstalled", () => {
    it("checks the installed model list for Ollama backends only", async () => {
      const ollamaBackend = resolveBackend({});
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ models: [{ name: "granite-embedding:278m" }] })
      );

      await expect(
        isOllamaModelInstalled(ollamaBackend, "embed")
      ).resolves.toBe(true);

      const hfBackend = resolveBackend({ huggingfaceApiKey: "manual-key" });
      await expect(isOllamaModelInstalled(hfBackend, "chat")).resolves.toBe(true);
    });
  });
});
