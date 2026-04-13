export type SearchResult = {
  id: string;
  similarity: number;
  preview: Record<string, string | number>;
  collection?: string;
};

type ProviderMeta = {
  provider: string;
  model: string;
};

export type StepEvent =
  | {
      step: "prepare";
      status: "running";
      data: ProviderMeta & {
        kind: "chat" | "embed";
        message: string;
        completed?: number;
        total?: number;
        determinate?: boolean;
      };
    }
  | {
      step: "prepare";
      status: "complete";
      latencyMs: number;
      data: ProviderMeta & {
        kind: "chat" | "embed";
        downloaded: boolean;
      };
    }
  | { step: "analyze"; status: "running" }
  | {
      step: "analyze";
      status: "complete";
      latencyMs: number;
      data: ProviderMeta & {
        collection: string;
        collections?: string[];
        allCollections?: boolean;
        searchMode: string;
        intent: string;
        limit: number;
        sortField?: string;
        sortDir?: string;
        filterField?: string;
        filterOp?: string;
        filterValue?: unknown;
        fields?: string[];
        skipSearch?: boolean;
        _raw?: string;
      };
    }
  | { step: "embed"; status: "running" }
  | {
      step: "embed";
      status: "complete";
      latencyMs: number;
      data: ProviderMeta & {
        preview: number[];
        dims: number;
        real: boolean;
        error?: string;
      };
    }
  | { step: "embed"; status: "skipped" }
  | { step: "search"; status: "running" }
  | {
      step: "search";
      status: "complete";
      latencyMs: number;
      data: {
        command: string;
        count: number;
        collection: string;
        collections?: string[];
        results: SearchResult[];
      };
    }
  | { step: "search"; status: "skipped" }
  | {
      step: "respond";
      status: "running";
      data?: Partial<ProviderMeta> & {
        delta?: string;
        content?: string;
      };
    }
  | {
      step: "respond";
      status: "complete";
      latencyMs: number;
      data: ProviderMeta & { content: string };
    }
  | {
      step: "respond";
      status: "error";
      latencyMs: number;
      data: Partial<ProviderMeta> & { error: string };
    };

export interface ChatCollectionInfo {
  name: string;
  isVectorize: boolean;
  vectorDimension?: number | null;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestPayload {
  query: string;
  searchMode: string;
  keyspace?: string;
  collections?: ChatCollectionInfo[];
  activeCollection?: string;
  allCollectionFields?: Record<string, string[]>;
  history?: ChatHistoryMessage[];
}

export interface AnalyzeDecision {
  collection: string;
  searchMode: string;
  intent: string;
  limit: number;
  sortField: string | null;
  sortDir: "asc" | "desc";
  filterField: string | null;
  filterOp: string | null;
  filterValue: unknown;
  skipSearch: boolean;
  allCollections: boolean;
  targetedCollections: string[] | null;
  analyzeCollections?: string[];
  collectionFields: string[];
  rawAnalysis: string;
  /** Set when the analyzer picks a collection name not in the user's list. */
  requestedCollectionMissing?: string;
}
