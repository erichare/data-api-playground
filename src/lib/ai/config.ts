import type { ResolvedAiBackend } from "./types";

export const DEFAULT_HF_CHAT_MODEL = "Qwen/Qwen2.5-Coder-32B-Instruct";
export const DEFAULT_HF_EMBED_MODEL = "ibm-granite/granite-embedding-125m-english";
export const DEFAULT_OLLAMA_CHAT_MODEL = "granite3.1-dense:8b";
export const DEFAULT_OLLAMA_EMBED_MODEL = "granite-embedding:278m";
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getOllamaBaseUrl() {
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
