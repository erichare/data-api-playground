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

export interface TextGenerationChunk extends TextGenerationResult {
  delta: string;
}

export interface EmbeddingResult {
  embeddings: number[][];
  provider: AiProvider;
  model: string;
}

export type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
