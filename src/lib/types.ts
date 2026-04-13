/**
 * Core domain types shared between server and client code.
 */

/** Server-side vectorize configuration for an Astra DB collection. */
export interface CollectionVectorizeService {
  provider: string;
  modelName: string;
}

/** An Astra DB collection with its vector config, document count, and creation state. */
export interface Collection {
  name: string;
  count: number | null;
  documentCount?: number;
  vectorDim: number | null;
  vectorizeService?: CollectionVectorizeService | null;
  creating?: boolean;
  pendingKey?: string;
}

/** A search result reference displayed alongside chat responses. */
export interface DocumentSource {
  collection: string;
  id: string;
  similarity: number;
  preview: Record<string, string | number>;
}

export type SearchMode = "vector" | "hybrid" | "lexical";

/** A single chat message with optional search sources and pipeline trace. */
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

/** A conversation thread persisted in SQLite with lazy-loaded messages. */
export interface Conversation {
  id: string;
  name: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export type ViewMode = "chat" | "ingest" | "api";

export type IngestFileType =
  | "pdf"
  | "txt"
  | "md"
  | "csv"
  | "json"
  | "docx"
  | "xlsx";

/** Summary record for the document library (one per source file, stored in SQLite). */
export interface IngestedDocumentSummary {
  source_doc_id: string;
  source_filename: string;
  file_type: IngestFileType;
  file_size: number;
  content_hash: string;
  chunk_total: number;
  ingested_at: string;
  collection: string;
}

export type PipelineStepId = "prepare" | "analyze" | "embed" | "search" | "respond";
export type PipelineStepStatus = "pending" | "running" | "complete" | "error" | "skipped";

/** A single step in the RAG chat pipeline with its execution status and timing. */
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
