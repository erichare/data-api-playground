import { recordAstraClientCall } from "@/lib/astraClientLog";
import { LOW_SIMILARITY_THRESHOLD } from "@/lib/chat/constants";
import type { ChatCollectionInfo, SearchResult } from "@/lib/chat/types";
import { mapWithConcurrency } from "@/lib/concurrency";
import { docPreview } from "@/lib/knowledge/dataApi/collectionConfig";
import {
  buildFilterClause,
  sanitizeFilterField,
} from "@/lib/knowledge/dataApi/filters";
import {
  normalizeDataApiKnowledgeConfig,
  type CreateDataApiDb,
  type DataApiDb,
  type DataApiKnowledgeConfig,
} from "@/lib/knowledge/dataApi/config";
import type { KnowledgeSearchRequest } from "@/lib/knowledge/types";

const SEARCH_FAN_OUT_CONCURRENCY = 4;

interface SearchExecution {
  results: SearchResult[];
  command: string;
}

function getCollectionDimension(
  collections: ChatCollectionInfo[] | undefined,
  name: string
) {
  const collection = collections?.find((candidate) => candidate.name === name);
  return collection?.vectorDimension ?? null;
}

function assertSearchVectorDimension(args: {
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

async function executeDataApiSearch(
  request: KnowledgeSearchRequest,
  db: DataApiDb,
  filter: Record<string, unknown>,
  filterString: string,
  collectionName: string,
  isVectorize: boolean
): Promise<SearchExecution> {
  const {
    collections,
    searchMode,
    sortField,
    sortDir,
    limit,
    query,
    embeddingVector,
  } = request;

  const safeSortField = sanitizeFilterField(sortField);
  assertSearchVectorDimension({
    collections,
    collectionName,
    isVectorize,
    embeddingVector,
  });

  const collectionRef = db.collection(collectionName);

  if (safeSortField) {
    const sortObj: Record<string, 1 | -1> = {
      [safeSortField]: sortDir === "asc" ? 1 : -1,
    };
    const command = `await db.collection("${collectionName}")\n  .find(${filterString}, { sort: { ${safeSortField}: ${sortDir === "asc" ? 1 : -1} }, limit: ${limit} })\n  .toArray()`;
    recordAstraClientCall({ label: "Chat Search", code: command });
    const docs = await collectionRef.find(filter, { sort: sortObj, limit }).toArray();
    return {
      results: docs.map((doc) => ({
        id: String(doc._id),
        similarity: 1,
        preview: docPreview(doc as Record<string, unknown>),
        collection: collectionName,
      })),
      command,
    };
  }

  if (isVectorize) {
    if (searchMode === "hybrid") {
      const hybridCommand = `await db.collection("${collectionName}")\n  .findAndRerank(${filterString}, { sort: { $hybrid: { $vectorize: query } }, limit: ${limit} })\n  .toArray()`;
      try {
        recordAstraClientCall({ label: "Chat Search", code: hybridCommand });
        const cursor = collectionRef.findAndRerank(filter, {
          sort: { $hybrid: { $vectorize: query } } as never,
          limit,
        });
        const docs = await cursor.toArray();
        return {
          results: docs.map((doc) => ({
            id: String((doc.document as Record<string, unknown>)._id),
            similarity: doc.scores["$vector"] ?? doc.scores["$reranker"] ?? 1,
            preview: docPreview(doc.document as Record<string, unknown>),
            collection: collectionName,
          })),
          command: hybridCommand,
        };
      } catch {
        // Fall through to plain vectorize search.
      }
    }

    const vectorizeCommand = `await db.collection("${collectionName}")\n  .find(${filterString}, { sort: { $vectorize: query }, limit: ${limit}, includeSimilarity: true })\n  .toArray()`;
    recordAstraClientCall({ label: "Chat Search", code: vectorizeCommand });
    const docs = await collectionRef.find(filter, {
      sort: { $vectorize: query },
      limit,
      includeSimilarity: true,
    }).toArray();
    return {
      results: docs.map((doc) => ({
        id: String(doc._id),
        similarity: (doc as { $similarity?: number }).$similarity ?? 1,
        preview: docPreview(doc as Record<string, unknown>),
        collection: collectionName,
      })),
      command: vectorizeCommand,
    };
  }

  if (embeddingVector.length > 0) {
    const vectorCommand = `await db.collection("${collectionName}")\n  .find(${filterString}, { sort: { $vector: embedding }, limit: ${limit}, includeSimilarity: true })\n  .toArray()`;
    recordAstraClientCall({ label: "Chat Search", code: vectorCommand });
    const docs = await collectionRef.find(filter, {
      sort: { $vector: embeddingVector },
      limit,
      includeSimilarity: true,
    }).toArray();
    return {
      results: docs.map((doc) => ({
        id: String(doc._id),
        similarity: (doc as { $similarity?: number }).$similarity ?? 1,
        preview: docPreview(doc as Record<string, unknown>),
        collection: collectionName,
      })),
      command: vectorCommand,
    };
  }

  const plainCommand = `await db.collection("${collectionName}")\n  .find(${filterString}, { limit: ${limit} })\n  .toArray()`;
  recordAstraClientCall({ label: "Chat Search", code: plainCommand });
  const docs = await collectionRef.find(filter, { limit }).toArray();
  return {
    results: docs.map((doc) => ({
      id: String(doc._id),
      similarity: 1,
      preview: docPreview(doc as Record<string, unknown>),
      collection: collectionName,
    })),
    command: plainCommand,
  };
}

function pickBestSearchExecution(executions: SearchExecution[]) {
  return executions.reduce<SearchExecution | null>((best, execution) => {
    const executionScore = execution.results[0]?.similarity ?? Number.NEGATIVE_INFINITY;
    const bestScore = best?.results[0]?.similarity ?? Number.NEGATIVE_INFINITY;
    return executionScore > bestScore ? execution : best;
  }, null);
}

export async function searchDataApiKnowledge(
  request: KnowledgeSearchRequest,
  createDb: CreateDataApiDb,
  displayName: string
) {
  const {
    config,
    collection,
    collections,
    collectionsToSearch,
    userCollections,
    filterField,
    filterOp,
    filterValue,
    limit,
  } = request;
  const normalizedConfig = normalizeDataApiKnowledgeConfig(
    config as DataApiKnowledgeConfig,
    displayName
  );

  const db = createDb(normalizedConfig, normalizedConfig.keyspace);
  const { filter: filterClause, filterString: filterStr } = buildFilterClause({
    field: filterField,
    op: filterOp,
    value: filterValue,
  });

  let resolvedCollection = collection;
  let searchResults: SearchResult[] = [];
  let commandStr = "";
  const hasFilter = Object.keys(filterClause).length > 0;

  if (collectionsToSearch.length === 1) {
    try {
      const result = await executeDataApiSearch(
        request,
        db,
        filterClause,
        filterStr,
        collectionsToSearch[0].name,
        collectionsToSearch[0].isVec
      );
      searchResults = result.results;
      commandStr = result.command;
    } catch (searchError) {
      if (hasFilter) {
        const result = await executeDataApiSearch(
          request,
          db,
          {},
          "{}",
          collectionsToSearch[0].name,
          collectionsToSearch[0].isVec
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
    if (topSimilarity < LOW_SIMILARITY_THRESHOLD && otherCollections.length > 0) {
      const fanTargets = otherCollections.map((name) => ({
        name,
        isVec:
          collections?.find((collectionInfo) => collectionInfo.name === name)
            ?.isVectorize ?? false,
      }));
      const fanResults = await mapWithConcurrency(
        fanTargets,
        SEARCH_FAN_OUT_CONCURRENCY,
        ({ name, isVec }) =>
          executeDataApiSearch(
            request,
            db,
            hasFilter ? filterClause : {},
            hasFilter ? filterStr : "{}",
            name,
            isVec
          )
      );
      const fanBest = fanResults
        .flatMap((result) => result.status === "fulfilled" ? result.value.results : [])
        .sort((left, right) => right.similarity - left.similarity);
      const bestFanExecution = pickBestSearchExecution(
        fanResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
      );
      if ((fanBest[0]?.similarity ?? 0) > topSimilarity) {
        searchResults = fanBest.slice(0, limit);
        const fanCollections = [
          ...new Set(searchResults.map((result) => result.collection).filter(Boolean)),
        ];
        commandStr = [
          `// Low-confidence fallback: searched ${fanCollections.join(", ")}`,
          bestFanExecution?.command ?? "",
        ]
          .filter(Boolean)
          .join("\n");
        resolvedCollection = fanCollections[0] ?? resolvedCollection;
      }
    }
  } else {
    const fanResults = await mapWithConcurrency(
      collectionsToSearch,
      SEARCH_FAN_OUT_CONCURRENCY,
      ({ name, isVec }) =>
        executeDataApiSearch(
          request,
          db,
          hasFilter ? filterClause : {},
          hasFilter ? filterStr : "{}",
          name,
          isVec
        )
    );
    searchResults = fanResults
      .flatMap((result) => result.status === "fulfilled" ? result.value.results : [])
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, limit);
    const successCount = fanResults.filter(
      (result) => result.status === "fulfilled"
    ).length;
    const bestFanExecution = pickBestSearchExecution(
      fanResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
    );
    commandStr = [
      `// Searched ${successCount} collection${successCount !== 1 ? "s" : ""}: ${collectionsToSearch
        .map((collectionInfo) => collectionInfo.name)
        .join(", ")}`,
      bestFanExecution?.command ?? "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return {
    searchResults,
    commandStr,
    collection: resolvedCollection,
  };
}
