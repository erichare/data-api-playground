import { describe, expect, it, vi } from "vitest";
import type { EnsureModelProgress, ResolvedAiBackend } from "@/lib/ai/service";
import { createPrepareTracker } from "./prepare";

const ollamaBackend: ResolvedAiBackend = {
  provider: "ollama",
  source: "local",
  huggingFaceKeyPresent: false,
  chatModel: "granite3.1-dense:8b",
  embedModel: "granite-embedding:278m",
  ollamaBaseUrl: "http://127.0.0.1:11434",
};

const huggingFaceBackend: ResolvedAiBackend = {
  provider: "huggingface",
  source: "manual",
  huggingfaceApiKey: "hf-key",
  huggingFaceKeyPresent: true,
  chatModel: "ibm-granite/granite-3.3-8b-instruct",
  embedModel: "ibm-granite/granite-embedding-125m-english",
  ollamaBaseUrl: "http://127.0.0.1:11434",
};

describe("createPrepareTracker", () => {
  it("passes through non-ollama backends without emitting prepare events", async () => {
    const send = vi.fn();
    const withPrepareTracking = createPrepareTracker(send);
    const task = vi.fn(async () => "done");

    await expect(
      withPrepareTracking({
        backend: huggingFaceBackend,
        kind: "chat",
        task,
      })
    ).resolves.toBe("done");

    expect(task).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("emits running and complete prepare events for Ollama downloads", async () => {
    const send = vi.fn();
    const withPrepareTracking = createPrepareTracker(send);

    const task = vi.fn(async (onPrepareProgress: (progress: EnsureModelProgress) => void) => {
      onPrepareProgress({
        provider: "ollama",
        kind: "embed",
        model: "granite-embedding:278m",
        status: "pulling manifest",
        determinate: false,
      });
      onPrepareProgress({
        provider: "ollama",
        kind: "embed",
        model: "granite-embedding:278m",
        status: "downloading",
        completed: 50,
        total: 100,
        determinate: true,
      });
      return "embedded";
    });

    await expect(
      withPrepareTracking({
        backend: ollamaBackend,
        kind: "embed",
        task,
      })
    ).resolves.toBe("embedded");

    expect(send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "prepare",
        status: "running",
        provider: "ollama",
        model: "granite-embedding:278m",
        kind: "embed",
        message: "pulling manifest",
        determinate: false,
      })
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "prepare",
        status: "running",
        provider: "ollama",
        model: "granite-embedding:278m",
        kind: "embed",
        message: "downloading",
        completed: 50,
        total: 100,
        determinate: true,
      })
    );
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "prepare",
        status: "complete",
        provider: "ollama",
        model: "granite-embedding:278m",
        kind: "embed",
        downloaded: true,
        latencyMs: expect.any(Number),
      })
    );
  });

  it("marks already-installed Ollama models as not downloaded", async () => {
    const send = vi.fn();
    const withPrepareTracking = createPrepareTracker(send);

    await withPrepareTracking({
      backend: ollamaBackend,
      kind: "chat",
      task: async (onPrepareProgress) => {
        onPrepareProgress({
          provider: "ollama",
          kind: "chat",
          model: "granite3.1-dense:8b",
          status: "Model already installed",
          determinate: false,
        });
        return undefined;
      },
    });

    expect(send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "prepare",
        status: "complete",
        provider: "ollama",
        model: "granite3.1-dense:8b",
        kind: "chat",
        downloaded: false,
      })
    );
  });
});
