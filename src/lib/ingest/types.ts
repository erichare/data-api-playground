import type { BackendConnectionInput } from "@/lib/backends/types";
import type { KnowledgeBackendInput } from "@/lib/knowledge/types";

export type CollectionDescription = {
  name: string;
  definition?: {
    vector?: {
      dimension?: number | null;
      service?: {
        provider?: string;
        modelName?: string;
      } | null;
    } | null;
  } | null;
};

export type IngestBackendHint = {
  provider: string;
  model: string;
};

export type ExistingIngestedDocument = {
  source_doc_id: string;
  source_filename: string;
  content_hash: string;
  ingested_at: string;
  collection: string;
  backend_kind?: string | null;
  backend_scope?: string | null;
  backend_source?: string | null;
  backend_document_ref?: string | null;
};

export type StoredIngestedDocument = ExistingIngestedDocument & {
  file_type: string;
  file_size: number;
  chunk_total: number;
  metadata?: string;
};

export type NameConflictAction = "overwrite" | "skip";

export type IngestPrepareEvent =
  | {
      type: "prepare";
      status: "running";
      provider: string;
      model: string;
      kind: "chat" | "embed";
      message: string;
      completed?: number;
      total?: number;
      determinate: boolean;
    }
  | {
      type: "prepare";
      status: "complete";
      provider: string;
      model: string;
      kind: "chat" | "embed";
      downloaded: boolean;
      latencyMs: number;
    };

export interface ParsedDocumentUpload {
  file: File;
  filename: string;
  fileType: string;
  collectionName: string;
  keyspace?: string;
  chunkSize: number;
  metadata: Record<string, unknown>;
  buffer: Buffer;
  huggingfaceApiKey?: string;
  nameConflictAction?: NameConflictAction;
  backend?: BackendConnectionInput["backend"];
  token?: string;
  endpoint?: string;
  username?: string;
  password?: string;
  knowledgeBackend?: KnowledgeBackendInput["knowledgeBackend"];
  openragApiKey?: string;
  openragBaseUrl?: string;
}
