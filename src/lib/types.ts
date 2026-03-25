export interface CollectionVectorizeService {
  provider: string;
  modelName: string;
}

export interface Collection {
  name: string;
  count: number;
  vectorDim: number | null;
  vectorizeService?: CollectionVectorizeService | null;
}

export interface DocumentSource {
  collection: string;
  id: string;
  similarity: number;
  preview: Record<string, string | number>;
}

export type SearchMode = "vector" | "hybrid" | "lexical";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: DocumentSource[];
  searchMode?: SearchMode;
  latencyMs?: number;
  timestamp: Date;
  pipelineSteps?: PipelineStep[];
}

export interface Conversation {
  id: string;
  name: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export type ViewMode = "chat" | "api";

export type PipelineStepId = "analyze" | "embed" | "search" | "respond";
export type PipelineStepStatus = "pending" | "running" | "complete" | "error" | "skipped";

export interface PipelineStep {
  id: PipelineStepId;
  status: PipelineStepStatus;
  latencyMs?: number;
  data?: Record<string, unknown>;
}

export interface CollectionDocument {
  _id: string;
  $vector?: number[] | null;
  [key: string]: unknown;
}

export interface IngestJob {
  id: string;
  collection: string;
  filename: string;
  totalRows: number;
  processedRows: number;
  completedAt?: Date;
  status: "pending" | "running" | "completed" | "failed";
}
