import {
  embedMany,
  type EnsureModelProgress,
  type EnsureModelResult,
  type ResolvedAiBackend,
} from "@/lib/ai/service";
import { getAstraDb, SYSTEM_FIELDS } from "@/lib/astra";
import { recordAstraClientCall } from "@/lib/astraClientLog";
import { mapWithConcurrency } from "@/lib/concurrency";
import type { ChatCollectionInfo, SearchResult } from "@/lib/chat/types";

const ALLOWED_FILTER_OPS = new Set([
  "$eq", "$ne", "$lt", "$lte", "$gt", "$gte", "$in", "$nin", "$exists",
]);

const SAFE_FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

function sanitizeFilterOp(op: string | null): string | null {
  if (!op) return null;
  return ALLOWED_FILTER_OPS.has(op) ? op : null;
}

function sanitizeFilterField(field: string | null): string | null {
  if (!field) return null;
  if (field.startsWith("$")) return null;
  if (!SAFE_FIELD_NAME_RE.test(field)) return null;
  return field;
}

type SafeFilterPrimitive = string | number | boolean;

/**
 * Reject filter values that are objects (could contain operator keys like $where)
 * or nested structures. Only primitives and arrays of primitives are safe.
 */
function isSafeFilterValue(
  value: unknown
): value is SafeFilterPrimitive | SafeFilterPrimitive[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")) return true;
  return false;
}

const SEARCH_FAN_OUT_CONCURRENCY = 4;


export interface EmbedResult {
  embeddingVector: number[];
  vectorPreview: number[];
  realEmbedding: boolean;
  provider: string;
  model: string;
  embedError?: string;
}

export function docPreview(
  doc: Record<string, unknown>
): Record<string, string | number> {
  const preview: Record<string, string | number> = {};
  let count = 0;

  for (const [key, value] of Object.entries(doc)) {
    if (SYSTEM_FIELDS.has(key)) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      preview[key] = typeof value === "boolean" ? String(value) : value;
      if (++count >= 4) break;
    }
  }

  return preview;
}

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

function getCollectionDimension(
  collections: ChatCollectionInfo[] | undefined,
  name: string
) {
  const collection = collections?.find((candidate) => candidate.name === name);
  return collection?.vectorDimension ?? null;
}

function assertVectorDimension(args: {
  collections: ChatCollectionInfo[] | undefined;
  collectionName: string;
  isVectorize: boolean;
  embeddingVector: number[];
}) {
  const { collections, collectionName, isVectorize, embeddingVector } = args;
  if (isVectorize || embeddingVector.length === 0) return;

  const dimension = getCollectionDimension(collections, collectionName);
  if (dimension && dimension !== embeddingVector.length) {
    throw new Error(
      `Embedding dimension mismatch for "${collectionName}": collection expects ${dimension}d but active model returned ${embeddingVector.length}d`
    );
  }
}

export async function searchCollections(args: {
  token?: string;
  endpoint?: string;
  keyspace?: string;
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
    token,
    endpoint,
    keyspace,
    isConnected,
    query,
    collections,
    collectionsToSearch,
    userCollections,
    searchMode,
    sortField,
    sortDir,
    limit,
    filterField,
    filterOp,
    filterValue,
    embeddingVector,
  } = args;
  let { collection } = args;

  if (!isConnected || !token || !endpoint) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      searchResults: [],
      commandStr: `await db.collection("${collection}")\n  .find({}, { sort: { $vector: embedding }, limit: ${limit} })\n  .toArray()`,
      collection,
    };
  }

  const db = getAstraDb(token, endpoint, keyspace);
  const safeSortField = sanitizeFilterField(sortField);
  const safeFilterField = sanitizeFilterField(filterField);
  const safeFilterOp = sanitizeFilterOp(filterOp);
  const safeFilterValue = isSafeFilterValue(filterValue) ? filterValue : null;
  const buildFilterClause = () => {
    if (!safeFilterField || safeFilterValue == null) return {};
    if (safeFilterOp === "$eq" || !safeFilterOp) return { [safeFilterField]: safeFilterValue };
    return { [safeFilterField]: { [safeFilterOp]: safeFilterValue } };
  };
  const filterClause = buildFilterClause();
  const filterStr = safeFilterField
    ? !safeFilterOp || safeFilterOp === "$eq"
      ? `{ ${safeFilterField}: ${JSON.stringify(safeFilterValue)} }`
      : `{ ${safeFilterField}: { ${safeFilterOp}: ${JSON.stringify(safeFilterValue)} } }`
    : "{}";

  const executeSearch = async (
    collectionName: string,
    isVectorize: boolean,
    filter: Record<string, unknown>,
    filterString: string
  ): Promise<{ results: SearchResult[]; command: string }> => {
    assertVectorDimension({
      collections,
      collectionName,
      isVectorize,
      embeddingVector,
    });

    const collectionRef = db.collection(collectionName);
    let results: SearchResult[] = [];
    let command = "";

    if (safeSortField) {
      const sortObj = {
        [safeSortField]: sortDir === "asc" ? 1 : -1,
      } as Record<string, 1 | -1>;
      command = `await db.collection("${collectionName}")\n  .find(${filterString}, { sort: { ${safeSortField}: ${sortDir === "asc" ? 1 : -1} }, limit: ${limit} })\n  .toArray()`;
      recordAstraClientCall({
        label: "Chat Search",
        code: command,
      });
      const docs = await collectionRef
        .find(filter, { sort: sortObj, limit })
        .toArray();
      results = docs.map((doc) => ({
        id: String(doc._id),
        similarity: 1,
        preview: docPreview(doc as Record<string, unknown>),
        collection: collectionName,
      }));
    } else if (isVectorize) {
      if (searchMode === "hybrid") {
        command = `await db.collection("${collectionName}")\n  .findAndRerank(${filterString}, { sort: { $hybrid: { $vectorize: query } }, limit: ${limit} })\n  .toArray()`;
        try {
          recordAstraClientCall({
            label: "Chat Search",
            code: command,
          });
          const cursor = collectionRef.findAndRerank(filter, {
            sort: { $hybrid: { $vectorize: query } } as never,
            limit,
          });
          const docs = await cursor.toArray();
          results = docs.map((doc) => ({
            id: String((doc.document as Record<string, unknown>)._id),
            similarity: doc.scores["$vector"] ?? doc.scores["$reranker"] ?? 1,
            preview: docPreview(doc.document as Record<string, unknown>),
            collection: collectionName,
          }));
        } catch {
          command = `await db.collection("${collectionName}")\n  .find(${filterString}, { sort: { $vectorize: query }, limit: ${limit}, includeSimilarity: true })\n  .toArray()`;
          recordAstraClientCall({
            label: "Chat Search",
            code: command,
          });
          const docs = await collectionRef
            .find(filter, {
              sort: { $vectorize: query },
              limit,
              includeSimilarity: true,
            })
            .toArray();
          results = docs.map((doc) => ({
            id: String(doc._id),
            similarity: (doc as { $similarity?: number }).$similarity ?? 1,
            preview: docPreview(doc as Record<string, unknown>),
            collection: collectionName,
          }));
        }
      } else {
        command = `await db.collection("${collectionName}")\n  .find(${filterString}, { sort: { $vectorize: query }, limit: ${limit}, includeSimilarity: true })\n  .toArray()`;
        recordAstraClientCall({
          label: "Chat Search",
          code: command,
        });
        const docs = await collectionRef
          .find(filter, {
            sort: { $vectorize: query },
            limit,
            includeSimilarity: true,
          })
          .toArray();
        results = docs.map((doc) => ({
          id: String(doc._id),
          similarity: (doc as { $similarity?: number }).$similarity ?? 1,
          preview: docPreview(doc as Record<string, unknown>),
          collection: collectionName,
        }));
      }
    } else if (embeddingVector.length > 0) {
      command = `await db.collection("${collectionName}")\n  .find(${filterString}, { sort: { $vector: embedding }, limit: ${limit}, includeSimilarity: true })\n  .toArray()`;
      recordAstraClientCall({
        label: "Chat Search",
        code: command,
      });
      const docs = await collectionRef
        .find(filter, {
          sort: { $vector: embeddingVector },
          limit,
          includeSimilarity: true,
        })
        .toArray();
      results = docs.map((doc) => ({
        id: String(doc._id),
        similarity: (doc as { $similarity?: number }).$similarity ?? 1,
        preview: docPreview(doc as Record<string, unknown>),
        collection: collectionName,
      }));
    } else {
      command = `await db.collection("${collectionName}")\n  .find(${filterString}, { limit: ${limit} })\n  .toArray()`;
      recordAstraClientCall({
        label: "Chat Search",
        code: command,
      });
      const docs = await collectionRef.find(filter, { limit }).toArray();
      results = docs.map((doc) => ({
        id: String(doc._id),
        similarity: 1,
        preview: docPreview(doc as Record<string, unknown>),
        collection: collectionName,
      }));
    }

    return { results, command };
  };

  const hasFilter = Object.keys(filterClause).length > 0;
  const lowSimilarityThreshold = 0.5;
  let searchResults: SearchResult[] = [];
  let commandStr = "";

  if (collectionsToSearch.length === 1) {
    try {
      const result = await executeSearch(
        collectionsToSearch[0].name,
        collectionsToSearch[0].isVec,
        filterClause,
        filterStr
      );
      searchResults = result.results;
      commandStr = result.command;
    } catch (searchError) {
      if (hasFilter) {
        const result = await executeSearch(
          collectionsToSearch[0].name,
          collectionsToSearch[0].isVec,
          {},
          "{}"
        );
        searchResults = result.results;
        commandStr = result.command;
      } else {
        const message =
          searchError instanceof Error ? searchError.message : String(searchError);
        throw new Error(`Search failed: ${message}`);
      }
    }

    const otherCollections = userCollections.filter(
      (name) => name !== collectionsToSearch[0].name
    );
    const topSimilarity = searchResults[0]?.similarity ?? 0;
    if (topSimilarity < lowSimilarityThreshold && otherCollections.length > 0) {
      const fanTargets = otherCollections.map((name) => ({
        name,
        isVec: collections?.find((collectionInfo) => collectionInfo.name === name)
          ?.isVectorize ?? false,
      }));
      const fanResults = await mapWithConcurrency(
        fanTargets,
        SEARCH_FAN_OUT_CONCURRENCY,
        ({ name, isVec }) =>
          executeSearch(
            name,
            isVec,
            hasFilter ? filterClause : {},
            hasFilter ? filterStr : "{}"
          )
      );
      const fanBest = fanResults
        .flatMap((result) =>
          result.status === "fulfilled" ? result.value.results : []
        )
        .sort((left, right) => right.similarity - left.similarity);
      if ((fanBest[0]?.similarity ?? 0) > topSimilarity) {
        searchResults = fanBest.slice(0, limit);
        const fanCollections = [
          ...new Set(
            searchResults.map((result) => result.collection).filter(Boolean)
          ),
        ];
        commandStr = `// Low-confidence fallback: searched ${fanCollections.join(", ")}`;
        collection = fanCollections[0] ?? collection;
      }
    }
  } else {
    const fanResults = await mapWithConcurrency(
      collectionsToSearch,
      SEARCH_FAN_OUT_CONCURRENCY,
      ({ name, isVec }) =>
        executeSearch(
          name,
          isVec,
          hasFilter ? filterClause : {},
          hasFilter ? filterStr : "{}"
        )
    );
    searchResults = fanResults
      .flatMap((result) =>
        result.status === "fulfilled" ? result.value.results : []
      )
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, limit);
    const successCount = fanResults.filter(
      (result) => result.status === "fulfilled"
    ).length;
    commandStr = `// Searched ${successCount} collection${successCount !== 1 ? "s" : ""}: ${collectionsToSearch
      .map((collectionInfo) => collectionInfo.name)
      .join(", ")}`;
  }

  return { searchResults, commandStr, collection };
}
