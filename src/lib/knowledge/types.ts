import type { ChatCollectionInfo, SearchResult } from "@/lib/chat/types";
import type {
  BackendConnectionInput,
  BackendConnectionState,
  DataApiBackendKind,
  KnowledgeBackendKind,
} from "@/lib/backends/types";

export interface KnowledgeBackendCapabilities {
  listSources: boolean;
  vectorSearch: boolean;
  hybridSearch: boolean;
  lexicalSearch: boolean;
  csvIngest: boolean;
  documentIngest: boolean;
  documentDelete: boolean;
  documentContentLoad: boolean;
}

export const DATA_API_KNOWLEDGE_BACKEND_CAPABILITIES: KnowledgeBackendCapabilities = {
  listSources: true,
  vectorSearch: true,
  hybridSearch: true,
  lexicalSearch: true,
  csvIngest: true,
  documentIngest: true,
  documentDelete: true,
  documentContentLoad: true,
};

export const OPENRAG_KNOWLEDGE_BACKEND_CAPABILITIES: KnowledgeBackendCapabilities = {
  listSources: true,
  vectorSearch: true,
  hybridSearch: false,
  lexicalSearch: false,
  csvIngest: false,
  documentIngest: true,
  documentDelete: true,
  documentContentLoad: true,
};

export function getKnowledgeBackendCapabilities(
  kind: KnowledgeBackendKind
): KnowledgeBackendCapabilities {
  return kind === "openrag"
    ? OPENRAG_KNOWLEDGE_BACKEND_CAPABILITIES
    : DATA_API_KNOWLEDGE_BACKEND_CAPABILITIES;
}

export type KnowledgeBackendMode = "connected" | "openrag";

export interface OpenragKnowledgeInput {
  knowledgeBackend: "openrag";
  openragApiKey?: string;
  openragBaseUrl?: string;
}

export interface OpenragKnowledgeState {
  kind: "openrag";
  apiKey: string;
  baseUrl: string;
  fromEnv?: boolean;
}

export interface OpenragKnowledgeStatus {
  kind: "openrag";
  ready: boolean;
  hasApiKey: boolean;
  hasBaseUrl: boolean;
}

export interface KnowledgeBackendStatuses {
  openrag: OpenragKnowledgeStatus;
}

export type KnowledgeBackendInput = BackendConnectionInput & {
  knowledgeBackend?: KnowledgeBackendKind;
  openragApiKey?: string;
  openragBaseUrl?: string;
};

export type KnowledgeBackendConfig =
  | BackendConnectionState
  | OpenragKnowledgeState;

export function getResolvedKnowledgeBackendKind(args: {
  selectedBackend: DataApiBackendKind;
  knowledgeBackendMode: KnowledgeBackendMode;
}): KnowledgeBackendKind {
  return args.knowledgeBackendMode === "openrag"
    ? "openrag"
    : args.selectedBackend;
}

export interface KnowledgeSource {
  name: string;
  vectorDimension: number | null;
  vectorizeProvider: string | null;
  vectorizeModel: string | null;
}

export interface KnowledgeDocumentRef {
  backendKind: KnowledgeBackendKind;
  source: string;
  documentRef: string;
}

export interface KnowledgeStoredDocument {
  sourceDocId: string;
  backendRef: KnowledgeDocumentRef;
}

export interface KnowledgeSearchCollection {
  name: string;
  isVec: boolean;
  vectorDimension?: number | null;
}

export interface KnowledgeSearchRequest {
  config: KnowledgeBackendConfig;
  query: string;
  collection: string;
  collections?: ChatCollectionInfo[];
  collectionsToSearch: KnowledgeSearchCollection[];
  userCollections: string[];
  searchMode: string;
  sortField: string | null;
  sortDir: "asc" | "desc";
  limit: number;
  filterField: string | null;
  filterOp: string | null;
  filterValue: unknown;
  embeddingVector: number[];
}

export interface KnowledgeSearchResult {
  searchResults: SearchResult[];
  commandStr: string;
  collection: string;
}

export interface KnowledgeCsvIngestRequest {
  config: KnowledgeBackendConfig;
  collection: string;
  rows: Record<string, string>[];
  filename: string;
  huggingfaceApiKey?: string;
}

export interface KnowledgeDocumentIngestRequest {
  config: KnowledgeBackendConfig;
  sourceDocId: string;
  collectionName: string;
  filename: string;
  fileType: string;
  text: string;
  fileBytes: Uint8Array;
  chunks: string[];
  metadata: Record<string, unknown>;
  huggingfaceApiKey?: string;
}

export interface KnowledgeDeleteDocumentRequest {
  config: KnowledgeBackendConfig;
  source: string;
  documentRef: string;
}

export interface KnowledgeLoadDocumentContentRequest {
  config: KnowledgeBackendConfig;
  source: string;
  documentRef: string;
}

export interface KnowledgeDocumentChunk {
  chunk_index: number;
  content: string;
}

export interface KnowledgeBackend {
  kind: KnowledgeBackendKind;
  capabilities: KnowledgeBackendCapabilities;
  listSources(config: KnowledgeBackendConfig): Promise<KnowledgeSource[]>;
  search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResult>;
  ingestCsv(
    request: KnowledgeCsvIngestRequest,
    send: (event: Record<string, unknown>) => void
  ): Promise<void>;
  ingestDocument(
    request: KnowledgeDocumentIngestRequest,
    send: (event: Record<string, unknown>) => void
  ): Promise<void>;
  deleteDocument(request: KnowledgeDeleteDocumentRequest): Promise<void>;
  loadDocumentContent(
    request: KnowledgeLoadDocumentContentRequest
  ): Promise<KnowledgeDocumentChunk[]>;
}
