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
  md5_hash: string;
  ingested_at: string;
  collection: string;
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
  token?: string;
  endpoint?: string;
  keyspace?: string;
  chunkSize: number;
  metadata: Record<string, unknown>;
  buffer: Buffer;
  huggingfaceApiKey?: string;
  nameConflictAction?: NameConflictAction;
}
