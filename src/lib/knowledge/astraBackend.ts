/* eslint-disable security/detect-object-injection -- Knowledge adapter constructs validated filter/query objects from constrained fields and operators. */
import { randomUUID } from "crypto";
import {
  embedMany,
  ensureModel,
  resolveBackend,
  type ResolvedAiBackend,
} from "@/lib/ai/service";
import * as astra from "@/lib/astra";
import type { BackendConnectionState, DataApiBackendKind } from "@/lib/backends/types";
import {
  buildTsCall,
  formatTsMethodCall,
  rawTs,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import { LOW_SIMILARITY_THRESHOLD } from "@/lib/chat/constants";
import type { ChatCollectionInfo, SearchResult } from "@/lib/chat/types";
import { mapWithConcurrency } from "@/lib/concurrency";
import type { CollectionDescription, IngestBackendHint } from "@/lib/ingest/types";
import {
  CSV_BATCH_SIZE,
  DOCUMENT_BATCH_SIZE,
} from "@/lib/ingest/constants";
import {
  DATA_API_KNOWLEDGE_BACKEND_CAPABILITIES,
} from "@/lib/knowledge/types";
import type {
  KnowledgeBackend,
  KnowledgeBackendConfig,
  KnowledgeDocumentChunk,
  KnowledgeSearchRequest,
  KnowledgeSource,
} from "@/lib/knowledge/types";

const ALLOWED_FILTER_OPS = new Set([
  "$eq", "$ne", "$lt", "$lte", "$gt", "$gte", "$in", "$nin", "$exists",
]);
const SAFE_FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
const SEARCH_FAN_OUT_CONCURRENCY = 4;
type DataApiDb = ReturnType<typeof astra.getAstraDb>;

type SafeFilterPrimitive = string | number | boolean;
type DataApiKnowledgeConfig = BackendConnectionState;
type LegacyDataApiKnowledgeConfig =
  | (Omit<Extract<BackendConnectionState, { backend: "astra" }>, "backend"> & {
      kind: "astra";
    })
  | (Omit<Extract<BackendConnectionState, { backend: "hcd" }>, "backend"> & {
      kind: "hcd";
    });

function getOptionalAstraEndpointValidator() {
  return Object.prototype.hasOwnProperty.call(astra, "isAllowedAstraEndpoint")
    ? (astra as { isAllowedAstraEndpoint?: (endpoint: string) => boolean })
      .isAllowedAstraEndpoint
    : undefined;
}

interface DataApiKnowledgeBackendFactoryArgs {
  kind: Exclude<DataApiBackendKind, never>;
  displayName: string;
  createDb: (config: DataApiKnowledgeConfig, keyspace?: string) => DataApiDb;
}

function normalizeDataApiKnowledgeConfig(
  config: KnowledgeBackendConfig | LegacyDataApiKnowledgeConfig,
  displayName: string
): DataApiKnowledgeConfig {
  if (!("backend" in config)) {
    if ("kind" in config && (config.kind === "astra" || config.kind === "hcd")) {
      return {
        ...config,
        backend: config.kind,
      } as DataApiKnowledgeConfig;
    }
    throw new Error(`${displayName} knowledge backend is not supported`);
  }

  if (config.backend === "astra") {
    if (!config.token || !config.endpoint) {
      throw new Error(`${displayName} knowledge backend requires a token and endpoint`);
    }
    return config;
  }

  if (!config.endpoint || !config.username || !config.password) {
    throw new Error(
      `${displayName} knowledge backend requires an endpoint, username, and password`
    );
  }
  return config;
}

function sanitizeFilterOp(op: string | null): string | null {
  if (!op) return null;
  return ALLOWED_FILTER_OPS.has(op) ? op : null;
}

export function sanitizeFilterField(field: string | null): string | null {
  if (!field) return null;
  if (field.startsWith("$")) return null;
  if (!SAFE_FIELD_NAME_RE.test(field)) return null;
  return field;
}

function isSafeFilterValue(
  value: unknown
): value is SafeFilterPrimitive | SafeFilterPrimitive[] {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  return Array.isArray(value) && value.every((entry) => {
    return (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    );
  });
}

export function docPreview(
  doc: Record<string, unknown>
): Record<string, string | number> {
  const preview: Record<string, string | number> = {};
  let count = 0;

  for (const [key, value] of Object.entries(doc)) {
    if (astra.SYSTEM_FIELDS.has(key)) continue;
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

function mapCollectionDescriptionToSource(
  description: CollectionDescription
): KnowledgeSource {
  const vectorDef = description.definition?.vector;
  const service = vectorDef?.service ?? null;

  return {
    name: description.name,
    vectorDimension: vectorDef?.dimension ?? null,
    vectorizeProvider: service?.provider ?? null,
    vectorizeModel: service?.modelName ?? null,
  };
}

function isKnowledgeSource(
  input: CollectionDescription | KnowledgeSource
): input is KnowledgeSource {
  return "vectorizeProvider" in input || "vectorizeModel" in input || "vectorDimension" in input;
}

export function getCollectionConfig(
  input: CollectionDescription | KnowledgeSource | undefined
) {
  if (!input) {
    return {
      useVectorize: false,
      vectorDimension: null,
      vectorizeProvider: "astra",
      vectorizeModel: "server-side vectorize",
    };
  }

  if (!isKnowledgeSource(input)) {
    return getCollectionConfig(mapCollectionDescriptionToSource(input));
  }

  return {
    useVectorize: !!input.vectorizeProvider,
    vectorDimension: input.vectorDimension ?? null,
    vectorizeProvider: input.vectorizeProvider ?? "astra",
    vectorizeModel: input.vectorizeModel ?? "server-side vectorize",
  };
}

export function getBackendHint(
  input: CollectionDescription | KnowledgeSource | undefined,
  backend: ResolvedAiBackend | null
): IngestBackendHint {
  const config = getCollectionConfig(input);

  if (config.useVectorize) {
    return {
      provider: config.vectorizeProvider,
      model: config.vectorizeModel,
    };
  }

  if (!backend) {
    return {
      provider: "unknown",
      model: "unknown",
    };
  }

  return {
    provider: backend.provider,
    model: backend.embedModel,
  };
}

export function validateVectorDimension(args: {
  collection: string;
  expected: number | null;
  embeddings: number[][];
}) {
  const { collection, expected, embeddings } = args;
  if (!expected || embeddings.length === 0) return;

  const actual = embeddings[0]?.length ?? 0;
  if (actual !== expected) {
    throw new Error(
      `Embedding dimension mismatch for "${collection}": collection expects ${expected}d but active model returned ${actual}d`
    );
  }
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

export async function resolveDataApiIngestContext(args: {
  config: DataApiKnowledgeConfig;
  collectionName: string;
  huggingfaceApiKey?: string;
  createDb: (config: DataApiKnowledgeConfig, keyspace?: string) => DataApiDb;
  displayName: string;
}) {
  const { config, collectionName, huggingfaceApiKey, createDb, displayName } = args;
  const normalizedConfig = normalizeDataApiKnowledgeConfig(config, displayName);

  const db = createDb(normalizedConfig, normalizedConfig.keyspace);
  const collection = db.collection(collectionName);

  recordAstraClientCall({
    label: "Inspect Collection Config",
    code: buildTsCall("db", [
      formatTsMethodCall("listCollections", [{ nameOnly: false }]),
    ]),
  });
  const collectionDescriptions = (await db.listCollections({
    nameOnly: false,
  })) as CollectionDescription[];
  const collectionDescription = collectionDescriptions.find(
    (candidate) => candidate.name === collectionName
  );
  const collectionSource = collectionDescription
    ? mapCollectionDescriptionToSource(collectionDescription)
    : undefined;
  const collectionConfig = getCollectionConfig(collectionSource);
  const backend = collectionConfig.useVectorize
    ? null
    : resolveBackend({ huggingfaceApiKey });
  const backendHint = getBackendHint(collectionSource, backend);

  return {
    db,
    collection,
    collectionDescription,
    collectionSource,
    collectionConfig,
    backend,
    backendHint,
  };
}

async function executeDataApiSearch(
  request: KnowledgeSearchRequest,
  db: DataApiDb,
  filter: Record<string, unknown>,
  filterString: string,
  collectionName: string,
  isVectorize: boolean
): Promise<{ results: SearchResult[]; command: string }> {
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
    const docs = await collectionRef.find(filter, { sort: sortObj, limit }).toArray();
    results = docs.map((doc) => ({
      id: String(doc._id),
      similarity: 1,
      preview: docPreview(doc as Record<string, unknown>),
      collection: collectionName,
    }));
    return { results, command };
  }

  if (isVectorize) {
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
        return { results, command };
      } catch {
        command = `await db.collection("${collectionName}")\n  .find(${filterString}, { sort: { $vectorize: query }, limit: ${limit}, includeSimilarity: true })\n  .toArray()`;
        recordAstraClientCall({
          label: "Chat Search",
          code: command,
        });
        const docs = await collectionRef.find(filter, {
          sort: { $vectorize: query },
          limit,
          includeSimilarity: true,
        }).toArray();
        results = docs.map((doc) => ({
          id: String(doc._id),
          similarity: (doc as { $similarity?: number }).$similarity ?? 1,
          preview: docPreview(doc as Record<string, unknown>),
          collection: collectionName,
        }));
        return { results, command };
      }
    }

    command = `await db.collection("${collectionName}")\n  .find(${filterString}, { sort: { $vectorize: query }, limit: ${limit}, includeSimilarity: true })\n  .toArray()`;
    recordAstraClientCall({
      label: "Chat Search",
      code: command,
    });
    const docs = await collectionRef.find(filter, {
      sort: { $vectorize: query },
      limit,
      includeSimilarity: true,
    }).toArray();
    results = docs.map((doc) => ({
      id: String(doc._id),
      similarity: (doc as { $similarity?: number }).$similarity ?? 1,
      preview: docPreview(doc as Record<string, unknown>),
      collection: collectionName,
    }));
    return { results, command };
  }

  if (embeddingVector.length > 0) {
    command = `await db.collection("${collectionName}")\n  .find(${filterString}, { sort: { $vector: embedding }, limit: ${limit}, includeSimilarity: true })\n  .toArray()`;
    recordAstraClientCall({
      label: "Chat Search",
      code: command,
    });
    const docs = await collectionRef.find(filter, {
      sort: { $vector: embeddingVector },
      limit,
      includeSimilarity: true,
    }).toArray();
    results = docs.map((doc) => ({
      id: String(doc._id),
      similarity: (doc as { $similarity?: number }).$similarity ?? 1,
      preview: docPreview(doc as Record<string, unknown>),
      collection: collectionName,
    }));
    return { results, command };
  }

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
  return { results, command };
}

async function searchDataApiKnowledge(
  request: KnowledgeSearchRequest,
  createDb: (config: DataApiKnowledgeConfig, keyspace?: string) => DataApiDb,
  displayName: string
) {
  const { config, collection, collections, collectionsToSearch, userCollections, filterField, filterOp, filterValue, limit } = request;
  const normalizedConfig = normalizeDataApiKnowledgeConfig(config, displayName);

  const db = createDb(normalizedConfig, normalizedConfig.keyspace);
  const safeFilterField = sanitizeFilterField(filterField);
  const safeFilterOp = sanitizeFilterOp(filterOp);
  const safeFilterValue = isSafeFilterValue(filterValue) ? filterValue : null;
  const filterClause =
    !safeFilterField || safeFilterValue == null
      ? {}
      : safeFilterOp === "$eq" || !safeFilterOp
        ? { [safeFilterField]: safeFilterValue }
        : { [safeFilterField]: { [safeFilterOp]: safeFilterValue } };
  const filterStr = safeFilterField
    ? !safeFilterOp || safeFilterOp === "$eq"
      ? `{ ${safeFilterField}: ${JSON.stringify(safeFilterValue)} }`
      : `{ ${safeFilterField}: { ${safeFilterOp}: ${JSON.stringify(safeFilterValue)} } }`
    : "{}";

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
      if ((fanBest[0]?.similarity ?? 0) > topSimilarity) {
        searchResults = fanBest.slice(0, limit);
        const fanCollections = [
          ...new Set(searchResults.map((result) => result.collection).filter(Boolean)),
        ];
        commandStr = `// Low-confidence fallback: searched ${fanCollections.join(", ")}`;
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
    commandStr = `// Searched ${successCount} collection${successCount !== 1 ? "s" : ""}: ${collectionsToSearch
      .map((collectionInfo) => collectionInfo.name)
      .join(", ")}`;
  }

  return {
    searchResults,
    commandStr,
    collection: resolvedCollection,
  };
}

export function createDataApiKnowledgeBackend(
  args: DataApiKnowledgeBackendFactoryArgs
): KnowledgeBackend {
  const { kind, displayName, createDb } = args;

  return {
    kind,
    capabilities: DATA_API_KNOWLEDGE_BACKEND_CAPABILITIES,

    async listSources(config) {
      const normalizedConfig = normalizeDataApiKnowledgeConfig(config, displayName);

      const db = createDb(normalizedConfig, normalizedConfig.keyspace);
      const descriptions = (await db.listCollections({
        nameOnly: false,
      })) as CollectionDescription[];
      return descriptions.map(mapCollectionDescriptionToSource);
    },

    search(request) {
      return searchDataApiKnowledge(request, createDb, displayName);
    },

    async ingestCsv(request, send) {
      const { collection, rows, filename, huggingfaceApiKey } = request;
      const { collection: collectionRef, collectionConfig, backend, backendHint } =
        await resolveDataApiIngestContext({
          config: request.config as DataApiKnowledgeConfig,
          collectionName: collection,
          huggingfaceApiKey,
          createDb,
          displayName,
        });

      if (backend) {
        const prepareStart = Date.now();
        await ensureModel({
          backend,
          kind: "embed",
          allowPull: true,
          onProgress: (progress) => {
            send({
              type: "prepare",
              status: "running",
              provider: backend.provider,
              model: backend.embedModel,
              kind: "embed",
              message: progress.status,
              completed: progress.completed,
              total: progress.total,
              determinate: progress.determinate,
            });
          },
        }).then((result) => {
          send({
            type: "prepare",
            status: "complete",
            provider: backend.provider,
            model: result.model,
            kind: "embed",
            downloaded: result.downloaded,
            latencyMs: Date.now() - prepareStart,
          });
        });
      }

      const total = rows.length;
      let processed = 0;

      send({
        type: "start",
        total,
        filename,
        collection,
        useVectorize: collectionConfig.useVectorize,
        provider: backendHint.provider,
        model: backendHint.model,
      });

      for (let index = 0; index < rows.length; index += CSV_BATCH_SIZE) {
        const batch = rows.slice(index, index + CSV_BATCH_SIZE);
        const texts = batch.map((row) =>
          Object.entries(row)
            .map(([key, value]) => `${key}: ${value}`)
            .join("; ")
        );

        const docs = collectionConfig.useVectorize
          ? batch.map((row, batchIndex) => ({
              ...row,
              $vectorize: texts[batchIndex],
              _filename: filename,
              _ingested_at: new Date().toISOString(),
            }))
          : await (async () => {
              if (!backend) {
                throw new Error("AI backend is required for non-vectorize collections");
              }
              const embeddings = (
                await embedMany({
                  backend,
                  input: texts,
                  allowPull: false,
                  skipEnsure: true,
                })
              ).embeddings;

              validateVectorDimension({
                collection,
                expected: collectionConfig.vectorDimension,
                embeddings,
              });

              return batch.map((row, batchIndex) => ({
                ...row,
                $vector: embeddings[batchIndex],
                _filename: filename,
                _ingested_at: new Date().toISOString(),
              }));
            })();

        recordAstraClientCall({
          label: "Ingest CSV Batch",
          code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
            formatTsMethodCall("insertMany", [
              rawTs(`rowsBatch /* ${docs.length} rows */`),
            ]),
          ]),
        });
        await collectionRef.insertMany(docs);
        processed += batch.length;
        send({ type: "progress", processed, total });
      }

      send({
        type: "complete",
        processed,
        total,
        provider: backendHint.provider,
        model: backendHint.model,
      });
    },

    async ingestDocument(request, send) {
      const { collectionName, sourceDocId, chunks, metadata, huggingfaceApiKey } = request;
      const { collection, collectionConfig, backend, backendHint } =
        await resolveDataApiIngestContext({
          config: request.config as DataApiKnowledgeConfig,
          collectionName,
          huggingfaceApiKey,
          createDb,
          displayName,
        });

      if (backend) {
        const prepareStart = Date.now();
        await ensureModel({
          backend,
          kind: "embed",
          allowPull: true,
          onProgress: (progress) => {
            send({
              type: "prepare",
              status: "running",
              provider: backend.provider,
              model: backend.embedModel,
              kind: "embed",
              message: progress.status,
              completed: progress.completed,
              total: progress.total,
              determinate: progress.determinate,
            });
          },
        }).then((result) => {
          send({
            type: "prepare",
            status: "complete",
            provider: backend.provider,
            model: result.model,
            kind: "embed",
            downloaded: result.downloaded,
            latencyMs: Date.now() - prepareStart,
          });
        });
      }

      send({
        type: "backend_info",
        useVectorize: collectionConfig.useVectorize,
        provider: backendHint.provider,
        model: backendHint.model,
      });

      for (let index = 0; index < chunks.length; index += DOCUMENT_BATCH_SIZE) {
        const batch = chunks.slice(index, index + DOCUMENT_BATCH_SIZE);

        let embeddings: number[][] | null = null;
        if (!collectionConfig.useVectorize) {
          if (!backend) {
            throw new Error("AI backend is required for non-vectorize collections");
          }
          embeddings = (
            await embedMany({
              backend,
              input: batch,
              allowPull: false,
              skipEnsure: true,
            })
          ).embeddings;
        }

        if (embeddings) {
          validateVectorDimension({
            collection: collectionName,
            expected: collectionConfig.vectorDimension,
            embeddings,
          });
        }

        const docs = batch.map((content, batchIndex) => {
          const chunkIndex = index + batchIndex;
          const doc: Record<string, unknown> = {
            _id: randomUUID(),
            content,
            metadata: {
              source_doc_id: sourceDocId,
              chunk_index: chunkIndex,
              ...metadata,
            },
          };

          if (collectionConfig.useVectorize) {
            doc.$vectorize = content;
          } else {
            doc.$vector = embeddings?.[batchIndex];
          }

          return doc;
        });

        send({
          type: "chunk_progress",
          processed: Math.min(index + DOCUMENT_BATCH_SIZE, chunks.length),
          total: chunks.length,
        });
        recordAstraClientCall({
          label: "Ingest Knowledge",
          code: buildTsCall(`db.collection(${JSON.stringify(collectionName)})`, [
            formatTsMethodCall("insertMany", [
              rawTs(`docsBatch /* ${docs.length} chunks */`),
            ]),
          ]),
        });
        await collection.insertMany(docs);
      }

      send({
        type: "backend_complete",
        provider: backendHint.provider,
        model: backendHint.model,
      });
    },

    async deleteDocument(request) {
      const { config, source, documentRef } = request;
      const normalizedConfig = normalizeDataApiKnowledgeConfig(config, displayName);

      const db = createDb(normalizedConfig, normalizedConfig.keyspace);
      recordAstraClientCall({
        label: "Delete Ingested Document",
        code: buildTsCall(`db.collection(${JSON.stringify(source)})`, [
          formatTsMethodCall("deleteMany", [
            { "metadata.source_doc_id": { $eq: documentRef } },
          ]),
        ]),
      });
      await db.collection(source).deleteMany({
        "metadata.source_doc_id": { $eq: documentRef },
      });
    },

    async loadDocumentContent(request): Promise<KnowledgeDocumentChunk[]> {
      const { config, source, documentRef } = request;
      const normalizedConfig = normalizeDataApiKnowledgeConfig(config, displayName);

      const db = createDb(normalizedConfig, normalizedConfig.keyspace);
      const coll = db.collection(source);
      const findCall = formatTsMethodCall("find", [
        { "metadata.source_doc_id": { $eq: documentRef } },
        {
          projection: { content: 1, metadata: 1 },
          limit: 1000,
        },
      ]);
      recordAstraClientCall({
        label: "Load Document Chunks",
        code: [
          `const cursor = db.collection(${JSON.stringify(source)})`,
          `  ${findCall};`,
          "",
          "for await (const doc of cursor) {",
          "  // collect content and metadata",
          "}",
        ].join("\n"),
      });

      const cursor = coll.find(
        { "metadata.source_doc_id": { $eq: documentRef } },
        {
          projection: { content: 1, metadata: 1 },
          limit: 1000,
        }
      );

      const chunks: KnowledgeDocumentChunk[] = [];
      for await (const doc of cursor) {
        const meta = (doc.metadata ?? {}) as Record<string, unknown>;
        const chunkIndex = typeof meta.chunk_index === "number" ? meta.chunk_index : 0;
        const content = typeof doc.content === "string" ? doc.content : String(doc.content ?? "");
        chunks.push({ chunk_index: chunkIndex, content });
      }

      chunks.sort((left, right) => left.chunk_index - right.chunk_index);
      return chunks;
    },
  };
}

export const astraKnowledgeBackend = createDataApiKnowledgeBackend({
  kind: "astra",
  displayName: "Astra",
  createDb(config, keyspace = config.keyspace) {
    if (config.backend !== "astra") {
      throw new Error("Invalid backend for Astra knowledge adapter");
    }
    if (!config.token || !config.endpoint) {
      throw new Error("Missing Data API token or endpoint");
    }
    const endpointValidator = getOptionalAstraEndpointValidator();
    if (typeof endpointValidator === "function" && !endpointValidator(config.endpoint)) {
      throw new Error("Endpoint must be a valid Data API endpoint");
    }
    return keyspace == null
      ? astra.getAstraDb(config.token, config.endpoint)
      : astra.getAstraDb(config.token, config.endpoint, keyspace);
  },
});

export function resolveAstraIngestContext(args: {
  config: BackendConnectionState;
  collectionName: string;
  huggingfaceApiKey?: string;
}) {
  return resolveDataApiIngestContext({
    ...args,
    displayName: "Astra",
    createDb(config, keyspace = config.keyspace) {
      if (config.backend !== "astra") {
        throw new Error("Invalid backend for Astra knowledge adapter");
      }
      if (!config.token || !config.endpoint) {
        throw new Error("Missing Data API token or endpoint");
      }
      const endpointValidator = getOptionalAstraEndpointValidator();
      if (typeof endpointValidator === "function" && !endpointValidator(config.endpoint)) {
        throw new Error("Endpoint must be a valid Data API endpoint");
      }
      return keyspace == null
        ? astra.getAstraDb(config.token, config.endpoint)
        : astra.getAstraDb(config.token, config.endpoint, keyspace);
    },
  });
}
