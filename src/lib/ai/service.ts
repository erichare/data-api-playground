type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiProvider = "huggingface" | "ollama";
export type AiModelKind = "chat" | "embed";

export interface ResolvedAiBackend {
  provider: AiProvider;
  source: "manual" | "env" | "local";
  huggingfaceApiKey?: string;
  huggingFaceKeyPresent: boolean;
  chatModel: string;
  embedModel: string;
  ollamaBaseUrl: string;
}

export interface AiStatus {
  hasHuggingFaceEnvKey: boolean;
  ollamaReachable: boolean;
  ollamaBaseUrl: string;
  chatModelInstalled: boolean;
  embedModelInstalled: boolean;
  chatModel: string;
  embedModel: string;
}

export interface EnsureModelProgress {
  provider: AiProvider;
  kind: AiModelKind;
  model: string;
  status: string;
  completed?: number;
  total?: number;
  determinate: boolean;
}

export interface EnsureModelResult {
  downloaded: boolean;
  model: string;
}

export interface TextGenerationResult {
  content: string;
  provider: AiProvider;
  model: string;
}

export interface EmbeddingResult {
  embeddings: number[][];
  provider: AiProvider;
  model: string;
}

const DEFAULT_HF_CHAT_MODEL = "ibm-granite/granite-3.3-8b-instruct";
const DEFAULT_HF_EMBED_MODEL = "ibm-granite/granite-embedding-125m-english";
const DEFAULT_OLLAMA_CHAT_MODEL = "granite3.1-dense:8b";
const DEFAULT_OLLAMA_EMBED_MODEL = "granite-embedding:278m";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getOllamaBaseUrl() {
  return trimTrailingSlash(process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL);
}

export function getAiModelConfig() {
  return {
    huggingfaceChatModel:
      process.env.HUGGINGFACE_CHAT_MODEL || DEFAULT_HF_CHAT_MODEL,
    huggingfaceEmbedModel:
      process.env.HUGGINGFACE_EMBED_MODEL || DEFAULT_HF_EMBED_MODEL,
    ollamaChatModel: process.env.OLLAMA_CHAT_MODEL || DEFAULT_OLLAMA_CHAT_MODEL,
    ollamaEmbedModel:
      process.env.OLLAMA_EMBED_MODEL || DEFAULT_OLLAMA_EMBED_MODEL,
    ollamaBaseUrl: getOllamaBaseUrl(),
  };
}

export function resolveBackend(args: {
  huggingfaceApiKey?: string;
}): ResolvedAiBackend {
  const manualKey = args.huggingfaceApiKey?.trim();
  const envKey = process.env.HUGGINGFACE_API_KEY?.trim();
  const models = getAiModelConfig();

  if (manualKey) {
    return {
      provider: "huggingface",
      source: "manual",
      huggingfaceApiKey: manualKey,
      huggingFaceKeyPresent: true,
      chatModel: models.huggingfaceChatModel,
      embedModel: models.huggingfaceEmbedModel,
      ollamaBaseUrl: models.ollamaBaseUrl,
    };
  }

  if (envKey) {
    return {
      provider: "huggingface",
      source: "env",
      huggingfaceApiKey: envKey,
      huggingFaceKeyPresent: true,
      chatModel: models.huggingfaceChatModel,
      embedModel: models.huggingfaceEmbedModel,
      ollamaBaseUrl: models.ollamaBaseUrl,
    };
  }

  return {
    provider: "ollama",
    source: "local",
    huggingFaceKeyPresent: false,
    chatModel: models.ollamaChatModel,
    embedModel: models.ollamaEmbedModel,
    ollamaBaseUrl: models.ollamaBaseUrl,
  };
}

function normalizeHuggingFaceChatModel(model: string) {
  return model.includes(":") ? model : `${model}:hf-inference`;
}

async function readErrorBody(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof payload.error === "string") return payload.error;
    if (payload.error && typeof payload.error === "object" && payload.error.message) {
      return payload.error.message;
    }
    if (payload.message) return payload.message;
  } catch {
    // Fall back to text below.
  }

  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return response.statusText || "Unknown error";
  }
}

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

async function* streamNdjson(response: Response): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      yield JSON.parse(line) as Record<string, unknown>;
    }
  }

  if (buffer.trim()) {
    yield JSON.parse(buffer) as Record<string, unknown>;
  }
}

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

  for await (const event of streamNdjson(response)) {
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
  }

  return { downloaded: true, model };
}

export async function generateText(args: {
  backend: ResolvedAiBackend;
  messages: ProviderMessage[];
  maxTokens: number;
  allowPull?: boolean;
  onPrepareProgress?: (progress: EnsureModelProgress) => void;
}) {
  const {
    backend,
    messages,
    maxTokens,
    allowPull = true,
    onPrepareProgress,
  } = args;

  if (backend.provider === "huggingface") {
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${backend.huggingfaceApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: normalizeHuggingFaceChatModel(backend.chatModel),
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

  await ensureModel({
    backend,
    kind: "chat",
    allowPull,
    onProgress: onPrepareProgress,
  });

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

export async function embedMany(args: {
  backend: ResolvedAiBackend;
  input: string[];
  allowPull?: boolean;
  skipEnsure?: boolean;
  onPrepareProgress?: (progress: EnsureModelProgress) => void;
}) {
  const {
    backend,
    input,
    allowPull = true,
    skipEnsure = false,
    onPrepareProgress,
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
    await ensureModel({
      backend,
      kind: "embed",
      allowPull,
      onProgress: onPrepareProgress,
    });
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
