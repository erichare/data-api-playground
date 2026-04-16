import { getDb } from "@/lib/db";
import type { BackendConnectionInput } from "@/lib/backends/types";
import { resolveKnowledgeBackend } from "@/lib/knowledge";
import type { KnowledgeBackendInput } from "@/lib/knowledge/types";
import type {
  ExistingIngestedDocument,
  StoredIngestedDocument,
} from "@/lib/ingest/types";

type StoredChunkRow = {
  chunk_index: number;
  content: string;
};

/**
 * Find the most recent ingested document with the same content hash in a collection.
 * Used to detect and skip duplicate uploads before processing.
 */
export function getLatestDuplicateByHash(args: {
  collection: string;
  contentHash: string;
}): ExistingIngestedDocument | undefined {
  return getDb()
    .prepare(
      `
        SELECT source_doc_id, source_filename, content_hash, ingested_at, collection
        FROM ingested_documents
        WHERE collection = ? AND content_hash = ?
        ORDER BY ingested_at DESC
        LIMIT 1
      `
    )
    .get(args.collection, args.contentHash) as ExistingIngestedDocument | undefined;
}

/**
 * Find all ingested documents in a collection that share the same filename.
 * Used to detect name conflicts and prompt the user for overwrite/skip.
 */
export function listFilenameConflicts(args: {
  collection: string;
  filename: string;
}): ExistingIngestedDocument[] {
  return getDb()
    .prepare(
      `
        SELECT source_doc_id, source_filename, content_hash, ingested_at, collection
             , backend_kind, backend_source, backend_document_ref
        FROM ingested_documents
        WHERE collection = ? AND source_filename = ?
        ORDER BY ingested_at DESC
      `
    )
    .all(args.collection, args.filename) as ExistingIngestedDocument[];
}

/** Load a persisted document record including backend metadata. */
export function getStoredIngestedDocument(args: {
  sourceDocId: string;
}): StoredIngestedDocument | undefined {
  return getDb()
    .prepare(
      `
        SELECT
          source_doc_id,
          source_filename,
          file_type,
          file_size,
          content_hash,
          chunk_total,
          collection,
          backend_kind,
          backend_source,
          backend_document_ref,
          ingested_at,
          metadata
        FROM ingested_documents
        WHERE source_doc_id = ?
        LIMIT 1
      `
    )
    .get(args.sourceDocId) as StoredIngestedDocument | undefined;
}

/**
 * Remove existing document records and their Astra DB chunks before re-ingestion.
 * Deletes SQLite records first (authoritative), then cleans up remote Astra chunks
 * on a best-effort basis. Orphaned Astra chunks are harmless; orphaned SQLite
 * records pointing to deleted chunks would break retry logic.
 */
export async function deleteDocumentsForOverwrite(args: {
  collectionName: string;
  backend?: BackendConnectionInput["backend"];
  token?: string;
  endpoint?: string;
  username?: string;
  password?: string;
  keyspace?: string;
  knowledgeBackend?: KnowledgeBackendInput["knowledgeBackend"];
  openragApiKey?: string;
  openragBaseUrl?: string;
  existingDocuments: ExistingIngestedDocument[];
}) {
  const {
    collectionName,
    backend: backendKind,
    token,
    endpoint,
    username,
    password,
    keyspace,
    knowledgeBackend,
    openragApiKey,
    openragBaseUrl,
    existingDocuments,
  } = args;
  if (existingDocuments.length === 0) return;

  // Delete from SQLite first — local metadata is the authoritative record.
  // This ensures that even if the remote Astra cleanup fails, the local
  // state is consistent and a retry won't see stale conflict records.
  const db = getDb();
  const deleteStmt = db.prepare(
    "DELETE FROM ingested_documents WHERE source_doc_id = ?"
  );
  const deleteTransaction = db.transaction((sourceDocIds: string[]) => {
    for (const sourceDocId of sourceDocIds) {
      deleteStmt.run(sourceDocId);
    }
  });

  deleteTransaction(
    existingDocuments.map((existingDocument) => existingDocument.source_doc_id)
  );

  // Then clean up remote Astra chunks — non-fatal if this fails.
  // Orphaned chunks in Astra are harmless; orphaned SQLite records
  // pointing to deleted Astra chunks would break overwrite retries.
  for (const existingDocument of existingDocuments) {
    try {
      const storedBackendKind =
        existingDocument.backend_kind === "openrag" ||
        existingDocument.backend_kind === "hcd"
          ? existingDocument.backend_kind
          : "astra";
      const { config, backend } = resolveKnowledgeBackend(
        {
          backend:
            storedBackendKind === "openrag"
              ? backendKind
              : (storedBackendKind as BackendConnectionInput["backend"]),
          token,
          endpoint,
          username,
          password,
          keyspace,
          knowledgeBackend:
            storedBackendKind === "openrag" ? "openrag" : knowledgeBackend,
          openragApiKey,
          openragBaseUrl,
        } as KnowledgeBackendInput,
        { includeDefaultKeyspace: true }
      );

      await backend.deleteDocument({
        config,
        source: existingDocument.backend_source ?? collectionName,
        documentRef:
          existingDocument.backend_document_ref ?? existingDocument.source_doc_id,
      });
    } catch (err) {
      console.error(
        `[deleteDocumentsForOverwrite] backend delete failed for "${collectionName}" / "${existingDocument.source_doc_id}":`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

export function replaceStoredDocumentChunks(args: {
  sourceDocId: string;
  chunks: string[];
}) {
  const db = getDb();
  const deleteStmt = db.prepare(
    "DELETE FROM ingested_document_chunks WHERE source_doc_id = ?"
  );
  const insertStmt = db.prepare(
    `
      INSERT INTO ingested_document_chunks (source_doc_id, chunk_index, content)
      VALUES (?, ?, ?)
    `
  );

  db.transaction(() => {
    deleteStmt.run(args.sourceDocId);
    args.chunks.forEach((chunk, index) => {
      insertStmt.run(args.sourceDocId, index, chunk);
    });
  })();
}

export function loadStoredDocumentChunks(args: { sourceDocId: string }) {
  return getDb()
    .prepare(
      `
        SELECT chunk_index, content
        FROM ingested_document_chunks
        WHERE source_doc_id = ?
        ORDER BY chunk_index ASC
      `
    )
    .all(args.sourceDocId) as StoredChunkRow[];
}

/** Persist a new ingested document metadata record to SQLite. */
export function insertIngestedDocumentRecord(args: {
  sourceDocId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  contentHash: string;
  chunkTotal: number;
  collection: string;
  backendKind: string;
  backendSource: string;
  backendDocumentRef: string;
  ingestedAt: string;
  metadata: Record<string, unknown>;
}) {
  const {
    sourceDocId,
    filename,
    fileType,
    fileSize,
    contentHash,
    chunkTotal,
    collection,
    backendKind,
    backendSource,
    backendDocumentRef,
    ingestedAt,
    metadata,
  } = args;

  getDb()
    .prepare(`
      INSERT INTO ingested_documents
        (source_doc_id, source_filename, file_type, file_size, content_hash, chunk_total, collection, backend_kind, backend_source, backend_document_ref, ingested_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      sourceDocId,
      filename,
      fileType,
      fileSize,
      contentHash,
      chunkTotal,
      collection,
      backendKind,
      backendSource,
      backendDocumentRef,
      ingestedAt,
      JSON.stringify(metadata)
    );
}

/** Insert or update an ingested document record (updates chunk count and timestamp on conflict). */
export function upsertIngestedDocumentRecord(args: {
  sourceDocId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  contentHash: string;
  chunkTotal: number;
  collection: string;
  backendKind: string;
  backendSource: string;
  backendDocumentRef: string;
  ingestedAt: string;
  metadata: Record<string, unknown>;
}) {
  const {
    sourceDocId,
    filename,
    fileType,
    fileSize,
    contentHash,
    chunkTotal,
    collection,
    backendKind,
    backendSource,
    backendDocumentRef,
    ingestedAt,
    metadata,
  } = args;

  getDb()
    .prepare(`
      INSERT INTO ingested_documents
        (source_doc_id, source_filename, file_type, file_size, content_hash, chunk_total, collection, backend_kind, backend_source, backend_document_ref, ingested_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_doc_id) DO UPDATE SET
        chunk_total = excluded.chunk_total,
        backend_kind = excluded.backend_kind,
        backend_source = excluded.backend_source,
        backend_document_ref = excluded.backend_document_ref,
        ingested_at = excluded.ingested_at
    `)
    .run(
      sourceDocId,
      filename,
      fileType,
      fileSize,
      contentHash,
      chunkTotal,
      collection,
      backendKind,
      backendSource,
      backendDocumentRef,
      ingestedAt,
      JSON.stringify(metadata)
    );
}
