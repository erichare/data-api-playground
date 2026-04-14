/**
 * AI backend configuration and resolution.
 *
 * Provides default model names for Hugging Face and Ollama providers,
 * and the `resolveBackend` function that selects a provider based on
 * the availability of API keys (manual key > env key > local Ollama).
 */
import type { ResolvedAiBackend } from "./types";

export const DEFAULT_HF_CHAT_MODEL = "Qwen/Qwen2.5-Coder-32B-Instruct";
export const DEFAULT_HF_EMBED_MODEL = "ibm-granite/granite-embedding-125m-english";
export const DEFAULT_OLLAMA_CHAT_MODEL = "granite3.1-dense:8b";
export const DEFAULT_OLLAMA_EMBED_MODEL = "granite-embedding:278m";
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

/**
 * Return the Ollama API base URL from env or default, with trailing slashes stripped.
 * Validates that the URL uses http or https to prevent SSRF via arbitrary protocols.
 */
export function getOllamaBaseUrl() {
  const raw = trimTrailingSlash(process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`OLLAMA_BASE_URL is not a valid URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `OLLAMA_BASE_URL must use http or https protocol, got: ${parsed.protocol}`
    );
  }
  return raw;
}

/** Return the configured model names and Ollama URL, reading from env vars with defaults. */
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

/**
 * Select the AI provider and model configuration.
 *
 * Resolution order:
 * 1. A manually supplied Hugging Face key (from the Connect dialog)
 * 2. `HUGGINGFACE_API_KEY` from the server environment
 * 3. Local Ollama fallback
 *
 * @param args.huggingfaceApiKey - Optional manual key from the client.
 * @returns A resolved backend with provider, credentials, and model names.
 */
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
