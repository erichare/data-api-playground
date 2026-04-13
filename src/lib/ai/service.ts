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

// ── Text generation ─────────────────────────────────────────────────────────

export async function generateText(args: {
  backend: ResolvedAiBackend;
  messages: ProviderMessage[];
  maxTokens: number;
  allowPull?: boolean;
  onPrepareProgress?: (progress: EnsureModelProgress) => void;
  onPrepared?: (result: EnsureModelResult) => void;
}) {
  const {
    backend,
    messages,
    maxTokens,
    allowPull = true,
    onPrepareProgress,
    onPrepared,
  } = args;

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
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(
        `Hugging Face ${response.status}: ${await readErrorBody(response)}`
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Hugging Face returned an empty chat response");
    }

    return {
      content,
      provider: "huggingface" as const,
      model: backend.chatModel,
    };
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
      stream: false,
    }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!response.ok) {
    throw new Error(`Ollama ${response.status}: ${await readErrorBody(response)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Ollama returned an empty chat response");
  }

  return {
    content,
    provider: "ollama" as const,
    model: backend.chatModel,
  };
}

// ── Streaming text generation ───────────────────────────────────────────────

export async function streamText(args: {
  backend: ResolvedAiBackend;
  messages: ProviderMessage[];
  maxTokens: number;
  allowPull?: boolean;
  onPrepareProgress?: (progress: EnsureModelProgress) => void;
  onPrepared?: (result: EnsureModelResult) => void;
  onChunk: (chunk: TextGenerationChunk) => void;
}) {
  const {
    backend,
    messages,
    maxTokens,
    allowPull = true,
    onPrepareProgress,
    onPrepared,
    onChunk,
  } = args;

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
        stream: true,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(
        `Hugging Face ${response.status}: ${await readErrorBody(response)}`
      );
    }

    const content = await consumeChatCompletionStream(response, (nextContent, delta) => {
      onChunk({
        content: nextContent,
        delta,
        provider: "huggingface",
        model: backend.chatModel,
      });
    });

    if (!content) {
      throw new Error("Hugging Face returned an empty chat response");
    }

    return {
      content,
      provider: "huggingface" as const,
      model: backend.chatModel,
    };
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
      stream: true,
    }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!response.ok) {
    throw new Error(`Ollama ${response.status}: ${await readErrorBody(response)}`);
  }

  const content = await consumeChatCompletionStream(response, (nextContent, delta) => {
    onChunk({
      content: nextContent,
      delta,
      provider: "ollama",
      model: backend.chatModel,
    });
  });

  if (!content) {
    throw new Error("Ollama returned an empty chat response");
  }

  return {
    content,
    provider: "ollama" as const,
    model: backend.chatModel,
  };
}

// ── Embeddings ──────────────────────────────────────────────────────────────

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
