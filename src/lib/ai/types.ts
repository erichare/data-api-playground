/**
 * Type definitions for the AI provider abstraction layer.
 *
 * The playground supports two providers: Hugging Face (cloud) and Ollama (local).
 * These types describe the resolved backend configuration, model availability
 * status, and the shapes of text generation and embedding results.
 */

/** Supported AI inference providers. */
export type AiProvider = "huggingface" | "ollama";
/** Model category: chat (text generation) or embed (embedding vectors). */
export type AiModelKind = "chat" | "embed";

/** The selected AI provider with its credentials and model names. */
export interface ResolvedAiBackend {
  provider: AiProvider;
  source: "manual" | "env" | "local";
  huggingfaceApiKey?: string;
  huggingFaceKeyPresent: boolean;
  chatModel: string;
  embedModel: string;
  ollamaBaseUrl: string;
}

/** Current availability of AI providers and their models. */
export interface AiStatus {
  hasHuggingFaceEnvKey: boolean;
  ollamaReachable: boolean;
  ollamaBaseUrl: string;
  chatModelInstalled: boolean;
  embedModelInstalled: boolean;
  chatModel: string;
  embedModel: string;
}

/** Real-time progress event emitted during an Ollama model pull. */
export interface EnsureModelProgress {
  provider: AiProvider;
  kind: AiModelKind;
  model: string;
  status: string;
  completed?: number;
  total?: number;
  determinate: boolean;
}

/** Outcome of an `ensureModel` call: whether the model was freshly downloaded. */
export interface EnsureModelResult {
  downloaded: boolean;
  model: string;
}

/** Result of a non-streaming text generation call. */
export interface TextGenerationResult {
  content: string;
  provider: AiProvider;
  model: string;
}

/** Incremental token received during streaming text generation. */
export interface TextGenerationChunk extends TextGenerationResult {
  delta: string;
}

/** Batch embedding result with one vector per input string. */
export interface EmbeddingResult {
  embeddings: number[][];
  provider: AiProvider;
  model: string;
}

/** Standardized chat message format accepted by both HuggingFace and Ollama. */
export type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
