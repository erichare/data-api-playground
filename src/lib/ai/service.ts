import { getAiModelConfig } from "./config";
import { consumeChatCompletionStream, consumeNdjsonStream, readErrorBody } from "./streaming";
import type {
  AiModelKind,
  AiStatus,
  EmbeddingResult,
  EnsureModelProgress,
  EnsureModelResult,
  ProviderMessage,
  ResolvedAiBackend,
  TextGenerationChunk,
} from "./types";

// ── Re-exports ──────────────────────────────────────────────────────────────
export type {
  AiModelKind,
  AiProvider,
  AiStatus,
  EmbeddingResult,
  EnsureModelProgress,
  EnsureModelResult,
  TextGenerationChunk,
  TextGenerationResult,
  ResolvedAiBackend,
} from "./types";
export { getAiModelConfig, resolveBackend } from "./config";

// ── Ollama helpers ──────────────────────────────────────────────────────────

async function listOllamaModels(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/tags`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Ollama ${response.status}: ${await readErrorBody(response)}`);
  }

  const payload = (await response.json()) as {
    models?: Array<{ name?: string; model?: string }>;
  };

  return payload.models ?? [];
}

function hasInstalledModel(
  models: Array<{ name?: string; model?: string }>,
  model: string
) {
  return models.some((candidate) => {
    const name = candidate.name ?? candidate.model ?? "";
    return name === model;
  });
}

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * Report the current AI backend availability.
 * Checks for a Hugging Face env key, Ollama reachability, and whether the
 * configured chat and embed models are installed in Ollama.
 */
export async function getAiStatus(): Promise<AiStatus> {
  const config = getAiModelConfig();
  const status: AiStatus = {
    hasHuggingFaceEnvKey: !!process.env.HUGGINGFACE_API_KEY?.trim(),
    ollamaReachable: false,
    ollamaBaseUrl: config.ollamaBaseUrl,
    chatModelInstalled: false,
    embedModelInstalled: false,
    chatModel: config.ollamaChatModel,
    embedModel: config.ollamaEmbedModel,
  };

  try {
    const models = await listOllamaModels(config.ollamaBaseUrl);
    status.ollamaReachable = true;
    status.chatModelInstalled = hasInstalledModel(models, config.ollamaChatModel);
    status.embedModelInstalled = hasInstalledModel(models, config.ollamaEmbedModel);
  } catch {
    // Treat Ollama as unavailable.
  }

  return status;
}

/** Check whether a specific Ollama model (chat or embed) is already downloaded. */
export async function isOllamaModelInstalled(
  backend: ResolvedAiBackend,
  kind: AiModelKind
) {
  if (backend.provider !== "ollama") return true;
  const model = kind === "chat" ? backend.chatModel : backend.embedModel;
  const models = await listOllamaModels(backend.ollamaBaseUrl);
  return hasInstalledModel(models, model);
}

// ── Model management ────────────────────────────────────────────────────────

/**
 * Ensure an Ollama model is available, pulling it on demand if allowed.
 * No-ops for Hugging Face backends. Reports download progress via `onProgress`.
 *
 * @throws When the model is missing and `allowPull` is `false`.
 */
export async function ensureModel(args: {
  backend: ResolvedAiBackend;
  kind: AiModelKind;
  allowPull: boolean;
  onProgress?: (progress: EnsureModelProgress) => void;
}): Promise<EnsureModelResult> {
  const { backend, kind, allowPull, onProgress } = args;

  if (backend.provider !== "ollama") {
    return {
      downloaded: false,
      model: kind === "chat" ? backend.chatModel : backend.embedModel,
    };
  }

  const model = kind === "chat" ? backend.chatModel : backend.embedModel;
  const models = await listOllamaModels(backend.ollamaBaseUrl);

  if (hasInstalledModel(models, model)) {
    onProgress?.({
      provider: "ollama",
      kind,
      model,
      status: "Model already installed",
      determinate: false,
    });
    return { downloaded: false, model };
  }

  if (!allowPull) {
    throw new Error(
      `Ollama model "${model}" is not installed. Run "ollama pull ${model}" or use a Hugging Face key.`
    );
  }

  const response = await fetch(`${backend.ollamaBaseUrl}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });

  if (!response.ok) {
    throw new Error(`Ollama ${response.status}: ${await readErrorBody(response)}`);
  }

  await consumeNdjsonStream(response, (event) => {
    const completed =
      typeof event.completed === "number" ? event.completed : undefined;
    const total = typeof event.total === "number" ? event.total : undefined;
    const determinate = typeof completed === "number" && typeof total === "number" && total > 0;
    onProgress?.({
      provider: "ollama",
      kind,
      model,
      status: String(event.status ?? "Downloading model"),
      completed,
      total,
      determinate,
    });
  });

  return { downloaded: true, model };
}

// ── Shared chat completion helper ───────────────────────────────────────────

/** Human-friendly provider label for error messages. */
function providerLabel(provider: "huggingface" | "ollama"): string {
  return provider === "huggingface" ? "Hugging Face" : "Ollama";
}

/**
 * Construct and send a chat-completion request to the resolved AI backend.
 *
 * Handles provider-specific URL, headers, timeout, and model preparation.
 * Returns the raw `Response` so callers can choose between JSON and SSE
 * consumption, eliminating the duplication between `generateText` and
 * `streamText`.
 */
async function fetchChatCompletion(args: {
  backend: ResolvedAiBackend;
  messages: ProviderMessage[];
  maxTokens: number;
  stream: boolean;
  allowPull: boolean;
  onPrepareProgress?: (progress: EnsureModelProgress) => void;
  onPrepared?: (result: EnsureModelResult) => void;
}): Promise<{ response: Response; provider: "huggingface" | "ollama"; model: string }> {
  const { backend, messages, maxTokens, stream, allowPull, onPrepareProgress, onPrepared } = args;

  if (backend.provider === "huggingface") {
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${backend.huggingfaceApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: backend.chatModel,
        messages,
        max_tokens: maxTokens,
        ...(stream ? { stream: true } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(
        `Hugging Face ${response.status}: ${await readErrorBody(response)}`
      );
    }

    return { response, provider: "huggingface", model: backend.chatModel };
  }

  const preparedModel = await ensureModel({
    backend,
    kind: "chat",
    allowPull,
    onProgress: onPrepareProgress,
  });
  onPrepared?.(preparedModel);

  const response = await fetch(`${backend.ollamaBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: backend.chatModel,
      messages,
      max_tokens: maxTokens,
      stream,
    }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!response.ok) {
    throw new Error(`Ollama ${response.status}: ${await readErrorBody(response)}`);
  }

  return { response, provider: "ollama", model: backend.chatModel };
}

// ── Text generation ─────────────────────────────────────────────────────────

/**
 * Generate a non-streaming chat completion from the resolved AI backend.
 * Automatically ensures the Ollama model is available before calling.
 *
 * @returns The generated text content, provider name, and model used.
 * @throws On provider HTTP errors or empty responses.
 */
export async function generateText(args: {
  backend: ResolvedAiBackend;
  messages: ProviderMessage[];
  maxTokens: number;
  allowPull?: boolean;
  onPrepareProgress?: (progress: EnsureModelProgress) => void;
  onPrepared?: (result: EnsureModelResult) => void;
}) {
  const { backend, messages, maxTokens, allowPull = true, onPrepareProgress, onPrepared } = args;

  const { response, provider, model } = await fetchChatCompletion({
    backend, messages, maxTokens, stream: false, allowPull, onPrepareProgress, onPrepared,
  });

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`${providerLabel(provider)} returned an empty chat response`);
  }

  return { content, provider, model };
}

// ── Streaming text generation ───────────────────────────────────────────────

/**
 * Generate a streaming chat completion, invoking `onChunk` for each token delta.
 * Uses SSE for Hugging Face and Ollama's streaming chat completions endpoint.
 *
 * @returns The fully accumulated text, provider name, and model used.
 */
export async function streamText(args: {
  backend: ResolvedAiBackend;
  messages: ProviderMessage[];
  maxTokens: number;
  allowPull?: boolean;
  onPrepareProgress?: (progress: EnsureModelProgress) => void;
  onPrepared?: (result: EnsureModelResult) => void;
  onChunk: (chunk: TextGenerationChunk) => void;
}) {
  const { backend, messages, maxTokens, allowPull = true, onPrepareProgress, onPrepared, onChunk } = args;

  const { response, provider, model } = await fetchChatCompletion({
    backend, messages, maxTokens, stream: true, allowPull, onPrepareProgress, onPrepared,
  });

  const content = await consumeChatCompletionStream(response, (nextContent, delta) => {
    onChunk({ content: nextContent, delta, provider, model });
  });

  if (!content) {
    throw new Error(`${providerLabel(provider)} returned an empty chat response`);
  }

  return { content, provider, model };
}

// ── Embeddings ──────────────────────────────────────────────────────────────

/**
 * Generate embedding vectors for one or more input strings.
 * Uses the Hugging Face feature-extraction pipeline or Ollama's embed API.
 *
 * @param args.skipEnsure - Skip the model availability check (use after a prior `ensureModel` call).
 * @returns An array of embedding vectors, one per input string.
 */
export async function embedMany(args: {
  backend: ResolvedAiBackend;
  input: string[];
  allowPull?: boolean;
  skipEnsure?: boolean;
  onPrepareProgress?: (progress: EnsureModelProgress) => void;
  onPrepared?: (result: EnsureModelResult) => void;
}): Promise<EmbeddingResult> {
  const {
    backend,
    input,
    allowPull = true,
    skipEnsure = false,
    onPrepareProgress,
    onPrepared,
  } = args;

  if (backend.provider === "huggingface") {
    const response = await fetch(
      `https://router.huggingface.co/hf-inference/models/${backend.embedModel}/pipeline/feature-extraction`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${backend.huggingfaceApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: input.length === 1 ? input[0] : input }),
        signal: AbortSignal.timeout(60_000),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Hugging Face ${response.status}: ${await readErrorBody(response)}`
      );
    }

    const result = (await response.json()) as
      | number[]
      | number[][]
      | number[][][];
    const normalized = Array.isArray(result[0])
      ? Array.isArray((result as number[][][])[0]?.[0])
        ? (result as number[][][]).map((row) => row[0])
        : (result as number[][])
      : [result as number[]];

    if (!Array.isArray(normalized[0]) || normalized[0].length === 0) {
      throw new Error("Hugging Face returned an invalid embedding payload");
    }

    return {
      embeddings: normalized,
      provider: "huggingface" as const,
      model: backend.embedModel,
    };
  }

  if (!skipEnsure) {
    const preparedModel = await ensureModel({
      backend,
      kind: "embed",
      allowPull,
      onProgress: onPrepareProgress,
    });
    onPrepared?.(preparedModel);
  }

  const response = await fetch(`${backend.ollamaBaseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: backend.embedModel,
      input,
      truncate: true,
    }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!response.ok) {
    throw new Error(`Ollama ${response.status}: ${await readErrorBody(response)}`);
  }

  const payload = (await response.json()) as {
    embeddings?: number[][];
  };
  const embeddings = payload.embeddings ?? [];
  if (!Array.isArray(embeddings[0]) || embeddings[0].length === 0) {
    throw new Error("Ollama returned an invalid embedding payload");
  }

  return {
    embeddings,
    provider: "ollama" as const,
    model: backend.embedModel,
  };
}
