import { OpenRAGClient } from "openrag-sdk";
import type { SearchFilters, SettingsResponse } from "openrag-sdk";
import { getDb } from "@/lib/db";
import type { SearchResult } from "@/lib/chat/types";
import {
  OPENRAG_KNOWLEDGE_BACKEND_CAPABILITIES,
} from "@/lib/knowledge/types";
import type {
  KnowledgeBackend,
  KnowledgeBackendConfig,
  KnowledgeDocumentChunk,
  KnowledgeSource,
} from "@/lib/knowledge/types";

type OpenragConfig = Extract<KnowledgeBackendConfig, { kind: "openrag" }>;

type CollectionRow = {
  collection: string;
};

type FilenameRow = {
  collection: string;
  source_filename: string;
};

type ChunkRow = {
  chunk_index: number;
  content: string;
};

type OpenragDocumentRefPayload = {
  type: "openrag";
  filename: string;
  sourceDocId: string;
};

function normalizeOpenragConfig(config: KnowledgeBackendConfig): OpenragConfig {
  if (!("kind" in config) || config.kind !== "openrag") {
    throw new Error("OpenRAG knowledge backend configuration is invalid");
  }
  if (!config.apiKey) {
    throw new Error("OpenRAG knowledge backend requires an API key");
  }
  return config;
}

function createClient(config: OpenragConfig) {
  return new OpenRAGClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });
}

function inferMimeType(fileType: string) {
  switch (fileType) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "md":
      return "text/markdown";
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "text/plain";
  }
}

export function createOpenragDocumentRef(args: {
  filename: string;
  sourceDocId: string;
}) {
  return JSON.stringify({
    type: "openrag",
    filename: args.filename,
    sourceDocId: args.sourceDocId,
  } satisfies OpenragDocumentRefPayload);
}

function parseOpenragDocumentRef(documentRef: string) {
  try {
    const parsed = JSON.parse(documentRef) as Partial<OpenragDocumentRefPayload>;
    if (
      parsed.type === "openrag" &&
      typeof parsed.filename === "string" &&
      typeof parsed.sourceDocId === "string"
    ) {
      return parsed as OpenragDocumentRefPayload;
    }
  } catch {
    // Fall back to treating legacy refs as the filename.
  }

  return {
    type: "openrag" as const,
    filename: documentRef,
    sourceDocId: "",
  };
}

function listOpenragCollections() {
  return getDb()
    .prepare(
      `
        SELECT DISTINCT collection
        FROM ingested_documents
        WHERE backend_kind = 'openrag'
        ORDER BY collection COLLATE NOCASE ASC
      `
    )
    .all() as CollectionRow[];
}

function listOpenragFilenames(collections: string[]) {
  if (collections.length === 0) {
    return [];
  }

  const placeholders = collections.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `
        SELECT collection, source_filename
        FROM ingested_documents
        WHERE backend_kind = 'openrag'
          AND collection IN (${placeholders})
      `
    )
    .all(...collections) as FilenameRow[];

  return rows;
}

function buildFilenameCollectionMap(rows: FilenameRow[]) {
  return new Map(rows.map((row) => [row.source_filename, row.collection]));
}

function buildOpenragFilters(collections: string[]): SearchFilters | undefined {
  const filenameRows = listOpenragFilenames(collections);
  const uniqueFilenames = [...new Set(filenameRows.map((row) => row.source_filename))];

  if (uniqueFilenames.length === 0) {
    return undefined;
  }

  return {
    data_sources: uniqueFilenames,
  };
}

function buildSearchPreview(result: {
  filename: string;
  text: string;
  page?: number | null;
  mimetype?: string | null;
}) {
  const preview: SearchResult["preview"] = {
    filename: result.filename,
    excerpt:
      result.text.length > 220 ? `${result.text.slice(0, 217).trimEnd()}...` : result.text,
  };

  if (typeof result.page === "number") {
    preview.page = result.page;
  }

  if (result.mimetype) {
    preview.mimetype = result.mimetype;
  }

  return preview;
}

async function getKnowledgeSettings(
  client: OpenRAGClient
): Promise<SettingsResponse | null> {
  try {
    return await client.settings.get();
  } catch {
    return null;
  }
}

function loadStoredChunks(sourceDocId: string): KnowledgeDocumentChunk[] {
  if (!sourceDocId) {
    return [];
  }

  return getDb()
    .prepare(
      `
        SELECT chunk_index, content
        FROM ingested_document_chunks
        WHERE source_doc_id = ?
        ORDER BY chunk_index ASC
      `
    )
    .all(sourceDocId) as ChunkRow[];
}

export const openragKnowledgeBackend: KnowledgeBackend = {
  kind: "openrag",
  capabilities: OPENRAG_KNOWLEDGE_BACKEND_CAPABILITIES,

  async listSources(config) {
    const normalizedConfig = normalizeOpenragConfig(config);
    const settings = await getKnowledgeSettings(createClient(normalizedConfig));
    const provider = settings?.knowledge.embedding_provider ?? "openrag";
    const model = settings?.knowledge.embedding_model ?? null;

    return listOpenragCollections().map((row): KnowledgeSource => ({
      name: row.collection,
      vectorDimension: null,
      vectorizeProvider: provider,
      vectorizeModel: model,
    }));
  },

  async search(request) {
    const normalizedConfig = normalizeOpenragConfig(request.config);

    if (request.searchMode !== "vector") {
      throw new Error("OpenRAG currently supports vector search only");
    }

    const targetCollections =
      request.collectionsToSearch.length > 0
        ? request.collectionsToSearch.map((collection) => collection.name)
        : [request.collection];
    const filenameRows = listOpenragFilenames(targetCollections);
    const filenameCollectionMap = buildFilenameCollectionMap(filenameRows);
    const filters = buildOpenragFilters(targetCollections);
    const client = createClient(normalizedConfig);
    const response = await client.search.query(request.query, {
      filters,
      limit: request.limit,
    });

    const searchResults: SearchResult[] = response.results.map((result, index) => ({
      id: `${result.filename}:${result.page ?? "chunk"}:${index}`,
      similarity: result.score,
      preview: buildSearchPreview(result),
      collection: filenameCollectionMap.get(result.filename) ?? request.collection,
    }));

    return {
      searchResults,
      commandStr: filters?.data_sources?.length
        ? `await openrag.search.query(${JSON.stringify(request.query)}, { filters: { data_sources: [${filters.data_sources.map((name) => JSON.stringify(name)).join(", ")}] }, limit: ${request.limit} })`
        : `await openrag.search.query(${JSON.stringify(request.query)}, { limit: ${request.limit} })`,
      collection: request.collection,
    };
  },

  async ingestCsv() {
    throw new Error("OpenRAG does not support CSV row ingest in this app yet");
  },

  async ingestDocument(request, send) {
    const normalizedConfig = normalizeOpenragConfig(request.config);
    const client = createClient(normalizedConfig);
    const fileBytes = new Uint8Array(request.fileBytes.byteLength);
    fileBytes.set(request.fileBytes);

    send({
      type: "backend_info",
      useVectorize: true,
      provider: "openrag",
      model: "semantic search",
    });

    const file = new File([fileBytes], request.filename, {
      type: inferMimeType(request.fileType),
    });
    await client.documents.ingest({
      file,
      filename: request.filename,
    });

    send({
      type: "chunk_progress",
      processed: request.chunks.length,
      total: request.chunks.length,
    });
    send({
      type: "backend_complete",
      provider: "openrag",
      model: "semantic search",
    });
  },

  async deleteDocument(request) {
    const normalizedConfig = normalizeOpenragConfig(request.config);
    const client = createClient(normalizedConfig);
    const ref = parseOpenragDocumentRef(request.documentRef);

    await client.documents.delete(ref.filename);
  },

  async loadDocumentContent(request) {
    normalizeOpenragConfig(request.config);
    const ref = parseOpenragDocumentRef(request.documentRef);
    return loadStoredChunks(ref.sourceDocId);
  },
};
