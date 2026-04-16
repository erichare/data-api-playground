import type {
  BackendCapabilities,
  BackendConnectionState,
  DataApiBackendKind,
} from "@/lib/backends/types";
import type { Collection } from "@/lib/types";

export type DocumentRecord = Record<string, unknown>;

export interface DataApiConnectResult {
  collections: Collection[];
  fields: Record<string, string[]>;
  keyspaces: string[];
  resolvedKeyspace?: string;
}

export interface DataApiBrowseRequest {
  config: BackendConnectionState;
  collection: string;
  pageState?: string | null;
  sort?:
    | {
        col: string;
        dir: 1 | -1;
      }
    | undefined;
}

export interface DataApiBrowseResult {
  documents: DocumentRecord[];
  nextPageState: string | null;
}

export interface DataApiProxyRequest {
  config: BackendConnectionState;
  collection: string;
  requestBody: Record<string, unknown>;
}

export interface DataApiDeleteDocumentsRequest {
  config: BackendConnectionState;
  collection: string;
  ids: string[];
}

export interface DataApiCreateCollectionRequest {
  config: BackendConnectionState;
  name: string;
  dimension: number;
  metric: "cosine" | "dot_product" | "euclidean";
  provider: string;
  model: string;
}

export interface ProviderModel {
  provider: string;
  providerDisplayName: string;
  modelName: string;
  vectorDimension: number | null;
}

export interface DataApiBackend {
  kind: DataApiBackendKind;
  capabilities: BackendCapabilities;
  connect(config: BackendConnectionState): Promise<DataApiConnectResult>;
  listKeyspaces(config: BackendConnectionState): Promise<string[]>;
  browse(request: DataApiBrowseRequest): Promise<DataApiBrowseResult>;
  count(config: BackendConnectionState, collection: string): Promise<number>;
  sampleFields(config: BackendConnectionState, collection: string): Promise<string[]>;
  createCollection(request: DataApiCreateCollectionRequest): Promise<Collection>;
  deleteCollection(config: BackendConnectionState, name: string): Promise<{ dropped: true }>;
  deleteDocuments(request: DataApiDeleteDocumentsRequest): Promise<{ deletedCount: number }>;
  listEmbeddingProviders(config: BackendConnectionState): Promise<ProviderModel[]>;
  proxy(request: DataApiProxyRequest): Promise<unknown>;
}
