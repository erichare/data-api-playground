import type { BackendConnectionInput } from "@/lib/backends/types";
import { resolveDataApiBackend } from "@/lib/dataApi";
import { getDb } from "@/lib/db";
import { getStoredIngestedDocument } from "@/lib/ingest/repository";
import { resolveKnowledgeBackend } from "@/lib/knowledge";
import type { KnowledgeBackendInput } from "@/lib/knowledge/types";
import type { Collection, IngestedDocumentSummary } from "@/lib/types";

/** Thrown for client-side validation errors (missing fields, bad input). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

type CollectionConnectionArgs = BackendConnectionInput;

type CreateCollectionArgs = CollectionConnectionArgs & {
  name: string;
  dimension: number;
  metric: "cosine" | "dot_product" | "euclidean";
  provider: string;
  model: string;
};

type DeleteCollectionArgs = CollectionConnectionArgs & {
  name: string;
};

type DeleteIngestedDocumentArgs = CollectionConnectionArgs & {
  source_doc_id: string;
  collection: string;
  knowledgeBackend?: KnowledgeBackendInput["knowledgeBackend"];
  openragApiKey?: string;
  openragBaseUrl?: string;
};

type LoadIngestedDocumentContentArgs = CollectionConnectionArgs & {
  source_doc_id: string;
  collection: string;
  knowledgeBackend?: KnowledgeBackendInput["knowledgeBackend"];
  openragApiKey?: string;
  openragBaseUrl?: string;
};

type DocRow = {
  source_doc_id: string;
  source_filename: string;
  file_type: string;
  file_size: number;
  content_hash: string;
  chunk_total: number;
  collection: string;
  ingested_at: string;
};

type DocumentCountRow = {
  collection: string;
  document_count: number;
};

/**
 * Query the SQLite document library, optionally filtered by collection name.
 * Returns the 500 most recently ingested documents, sorted by ingestion date descending.
 */
export function listIngestedDocuments(collection?: string): IngestedDocumentSummary[] {
  const db = getDb();
  const rows = (collection
    ? db
        .prepare(
          "SELECT * FROM ingested_documents WHERE collection = ? ORDER BY ingested_at DESC LIMIT 500"
        )
        .all(collection)
    : db
        .prepare("SELECT * FROM ingested_documents ORDER BY ingested_at DESC LIMIT 500")
        .all()) as DocRow[];

  return rows.map((row) => ({
    source_doc_id: row.source_doc_id,
    source_filename: row.source_filename,
    file_type: row.file_type as IngestedDocumentSummary["file_type"],
    file_size: row.file_size,
    content_hash: row.content_hash,
    chunk_total: row.chunk_total,
    collection: row.collection,
    ingested_at: row.ingested_at,
  }));
}

function getIngestedDocumentCountsByCollection(): Map<string, number> {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT collection, COUNT(*) AS document_count FROM ingested_documents GROUP BY collection"
    )
    .all() as DocumentCountRow[];

  return new Map(rows.map((row) => [row.collection, row.document_count]));
}

/**
 * List all collections in the connected backend and sample metadata for each.
 *
 * Enriches each collection with its ingested document count from SQLite.
 */
export async function fetchCollectionMetadata(args: CollectionConnectionArgs) {
  const ingestedDocumentCounts = getIngestedDocumentCountsByCollection();
  const { config, backend, capabilities } = resolveDataApiBackend(args, {
    includeDefaultKeyspace: true,
  });
  const result = await backend.connect(config);

  return {
    ...result,
    collections: result.collections.map((collection) => ({
      ...collection,
      documentCount: ingestedDocumentCounts.get(collection.name) ?? 0,
    })),
    capabilities,
  };
}

/**
 * Create a new collection in the active backend with the specified vector configuration.
 *
 * @throws {ValidationError} If the collection name is missing.
 */
export async function createCollection(
  args: CreateCollectionArgs
): Promise<Collection> {
  const { name, dimension, metric, provider, model } = args;
  if ((args.backend ?? "astra") === "astra") {
    if (!("token" in args) || !args.token || !args.endpoint || !name) {
      throw new ValidationError("token, endpoint, and name are required");
    }
  } else if (
    !args.endpoint ||
    !("username" in args) ||
    !args.username ||
    !args.password ||
    !name
  ) {
    throw new ValidationError("endpoint, username, password, and name are required");
  }

  const { config, backend } = resolveDataApiBackend(args, {
    includeDefaultKeyspace: true,
  });
  return backend.createCollection({
    config,
    name,
    dimension,
    metric,
    provider,
    model,
  });
}

export const createCollectionInAstra = createCollection;

/**
 * Drop a collection by name in the active backend.
 * @throws {ValidationError} If the collection name is missing.
 */
export async function deleteCollection(args: DeleteCollectionArgs) {
  if (!args.name) {
    throw new ValidationError("Missing collection name");
  }
  if ((args.backend ?? "astra") === "hcd") {
    if (
      !args.endpoint ||
      !("username" in args) ||
      !args.username ||
      !args.password
    ) {
      throw new ValidationError("Missing credentials");
    }
  } else if (!("token" in args) || !args.token || !args.endpoint) {
    throw new ValidationError("Missing credentials");
  }

  const { config, backend } = resolveDataApiBackend(args, {
    includeDefaultKeyspace: true,
  });
  return backend.deleteCollection(config, args.name);
}

export const deleteCollectionInAstra = deleteCollection;

function hasUsableKnowledgeConnection(
  config: ReturnType<typeof resolveKnowledgeBackend>["config"]
) {
  if (!("backend" in config)) {
    return Boolean(config.apiKey);
  }

  return config.backend === "astra"
    ? Boolean(config.token && config.endpoint)
    : Boolean(config.endpoint && config.username && config.password);
}

/**
 * Delete an ingested document's chunks from the active knowledge backend and
 * then its metadata record from SQLite.
 */
export async function deleteIngestedDocument(
  args: DeleteIngestedDocumentArgs
): Promise<{ ok: true }> {
  const { source_doc_id, collection } = args;
  const currentResolution = resolveKnowledgeBackend(args as KnowledgeBackendInput, {
    includeDefaultKeyspace: true,
  });

  if (!hasUsableKnowledgeConnection(currentResolution.config)) {
    const db = getDb();
    db.prepare("DELETE FROM ingested_documents WHERE source_doc_id = ?").run(source_doc_id);
    return { ok: true };
  }

  const stored = getStoredIngestedDocument({ sourceDocId: source_doc_id });
  const storedBackendKind =
    stored?.backend_kind === "openrag" || stored?.backend_kind === "hcd"
      ? stored.backend_kind
      : (args.backend ?? "astra");
  const { config, backend } = resolveKnowledgeBackend(
    {
      ...args,
      knowledgeBackend:
        storedBackendKind === "openrag" ? "openrag" : args.knowledgeBackend,
      backend:
        storedBackendKind === "openrag"
          ? args.backend
          : (storedBackendKind as BackendConnectionInput["backend"]),
    } as KnowledgeBackendInput,
    {
      includeDefaultKeyspace: true,
    }
  );

  if (hasUsableKnowledgeConnection(config)) {
    await backend.deleteDocument({
      config,
      source: stored?.backend_source ?? collection,
      documentRef: stored?.backend_document_ref ?? source_doc_id,
    });
  }

  const db = getDb();
  db.prepare("DELETE FROM ingested_documents WHERE source_doc_id = ?").run(source_doc_id);

  return { ok: true };
}

/**
 * Load the stored chunk content for an ingested document using the active
 * knowledge backend and the locally persisted backend reference.
 */
export async function loadIngestedDocumentContent(
  args: LoadIngestedDocumentContentArgs
) {
  const { source_doc_id, collection } = args;
  const currentResolution = resolveKnowledgeBackend(args as KnowledgeBackendInput, {
    includeDefaultKeyspace: true,
  });
  if (!hasUsableKnowledgeConnection(currentResolution.config)) {
    throw new ValidationError("Missing credentials");
  }

  const stored = getStoredIngestedDocument({ sourceDocId: source_doc_id });
  const storedBackendKind =
    stored?.backend_kind === "openrag" || stored?.backend_kind === "hcd"
      ? stored.backend_kind
      : (args.backend ?? "astra");
  const { config, backend } = resolveKnowledgeBackend(
    {
      ...args,
      knowledgeBackend:
        storedBackendKind === "openrag" ? "openrag" : args.knowledgeBackend,
      backend:
        storedBackendKind === "openrag"
          ? args.backend
          : (storedBackendKind as BackendConnectionInput["backend"]),
    } as KnowledgeBackendInput,
    { includeDefaultKeyspace: true }
  );

  return backend.loadDocumentContent({
    config,
    source: stored?.backend_source ?? collection,
    documentRef: stored?.backend_document_ref ?? source_doc_id,
  });
}
