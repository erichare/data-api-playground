import {
  embedMany,
  type EnsureModelProgress,
  type EnsureModelResult,
  type ResolvedAiBackend,
} from "@/lib/ai/service";
import type { BackendConnectionInput } from "@/lib/backends/types";
import { resolveKnowledgeBackend } from "@/lib/knowledge";
import type { KnowledgeBackendInput } from "@/lib/knowledge/types";
import type { ChatCollectionInfo, SearchResult } from "@/lib/chat/types";

export {
  docPreview,
  sanitizeFilterField,
} from "@/lib/knowledge/astraBackend";


export interface EmbedResult {
  embeddingVector: number[];
  vectorPreview: number[];
  realEmbedding: boolean;
  provider: string;
  model: string;
  embedError?: string;
}

/**
 * Generate an embedding vector for a user query.
 * Returns a zero-length vector for vectorize-enabled collections (embedding is server-side).
 */
export async function embedQuery(args: {
  backend: ResolvedAiBackend;
  query: string;
  isVectorize: boolean;
  onPrepareProgress?: (progress: EnsureModelProgress) => void;
  onPrepared?: (result: EnsureModelResult) => void;
}): Promise<EmbedResult> {
  const { backend, query, isVectorize, onPrepareProgress, onPrepared } = args;

  if (isVectorize) {
    return {
      embeddingVector: [],
      vectorPreview: [],
      realEmbedding: true,
      provider: "astra",
      model: "server-side vectorize",
    };
  }

  const result = await embedMany({
    backend,
    input: [query],
    onPrepareProgress,
    onPrepared,
  });
  const embeddingVector = result.embeddings[0] ?? [];
  if (embeddingVector.length === 0) {
    throw new Error(`${result.provider} returned an empty embedding`);
  }

  return {
    embeddingVector,
    vectorPreview: embeddingVector
      .slice(0, 8)
      .map((value) => parseFloat(value.toFixed(4))),
    realEmbedding: true,
    provider: result.provider,
    model: result.model,
  };
}

/**
 * Execute collection searches against the resolved knowledge backend.
 *
 * Supports vector, hybrid, and lexical search modes, optional field-based
 * sorting and filtering, and multi-collection fan-out. When searching a
 * single collection with low-confidence results, automatically fans out
 * to other available collections as a fallback.
 */
export async function searchCollections(args: {
  backend?: BackendConnectionInput["backend"];
  token?: string;
  endpoint?: string;
  username?: string;
  password?: string;
  keyspace?: string;
  knowledgeBackend?: KnowledgeBackendInput["knowledgeBackend"];
  openragApiKey?: string;
  openragBaseUrl?: string;
  isConnected: boolean;
  query: string;
  collection: string;
  collections?: ChatCollectionInfo[];
  collectionsToSearch: {
    name: string;
    isVec: boolean;
    vectorDimension?: number | null;
  }[];
  userCollections: string[];
  searchMode: string;
  sortField: string | null;
  sortDir: "asc" | "desc";
  limit: number;
  filterField: string | null;
  filterOp: string | null;
  filterValue: unknown;
  embeddingVector: number[];
}): Promise<{
  searchResults: SearchResult[];
  commandStr: string;
  collection: string;
}> {
  const {
    isConnected,
    limit,
  } = args;
  const { collection } = args;

  if (!isConnected) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      searchResults: [],
      commandStr: `await db.collection("${collection}")\n  .find({}, { sort: { $vector: embedding }, limit: ${limit} })\n  .toArray()`,
      collection,
    };
  }

  const { config, backend } = resolveKnowledgeBackend(
    {
      backend: args.backend,
      token: args.token,
      endpoint: args.endpoint,
      username: args.username,
      password: args.password,
      keyspace: args.keyspace,
      knowledgeBackend: args.knowledgeBackend,
      openragApiKey: args.openragApiKey,
      openragBaseUrl: args.openragBaseUrl,
    } as KnowledgeBackendInput,
    { includeDefaultKeyspace: true }
  );
  const result = await backend.search({
    config,
    query: args.query,
    collection,
    collections: args.collections,
    collectionsToSearch: args.collectionsToSearch,
    userCollections: args.userCollections,
    searchMode: args.searchMode,
    sortField: args.sortField,
    sortDir: args.sortDir,
    limit,
    filterField: args.filterField,
    filterOp: args.filterOp,
    filterValue: args.filterValue,
    embeddingVector: args.embeddingVector,
  });

  return {
    searchResults: result.searchResults,
    commandStr: result.commandStr,
    collection: result.collection,
  };
}
