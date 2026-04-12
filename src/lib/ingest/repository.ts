import { getAstraDb } from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import { getDb } from "@/lib/db";
import type { ExistingIngestedDocument } from "@/lib/ingest/types";

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

export function listFilenameConflicts(args: {
  collection: string;
  filename: string;
}): ExistingIngestedDocument[] {
  return getDb()
    .prepare(
      `
        SELECT source_doc_id, source_filename, content_hash, ingested_at, collection
        FROM ingested_documents
        WHERE collection = ? AND source_filename = ?
        ORDER BY ingested_at DESC
      `
    )
    .all(args.collection, args.filename) as ExistingIngestedDocument[];
}

export async function deleteDocumentsForOverwrite(args: {
  collectionName: string;
  token?: string;
  endpoint?: string;
  keyspace?: string;
  existingDocuments: ExistingIngestedDocument[];
}) {
  const { collectionName, token, endpoint, keyspace, existingDocuments } = args;
  if (existingDocuments.length === 0) return;

  if (token && endpoint) {
    const astraDb = getAstraDb(token, endpoint, keyspace);
    const collection = astraDb.collection(collectionName);

    for (const existingDocument of existingDocuments) {
      recordAstraClientCall({
        label: "Overwrite Ingested Document",
        code: buildTsCall(`db.collection(${JSON.stringify(collectionName)})`, [
          formatTsMethodCall("deleteMany", [
            {
              "metadata.source_doc_id": {
                $eq: existingDocument.source_doc_id,
              },
            },
          ]),
        ]),
      });
      await collection.deleteMany({
        "metadata.source_doc_id": { $eq: existingDocument.source_doc_id },
      });
    }
  }

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
}

export function insertIngestedDocumentRecord(args: {
  sourceDocId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  contentHash: string;
  chunkTotal: number;
  collection: string;
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
    ingestedAt,
    metadata,
  } = args;

  getDb()
    .prepare(`
      INSERT INTO ingested_documents
        (source_doc_id, source_filename, file_type, file_size, content_hash, chunk_total, collection, ingested_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      sourceDocId,
      filename,
      fileType,
      fileSize,
      contentHash,
      chunkTotal,
      collection,
      ingestedAt,
      JSON.stringify(metadata)
    );
}

export function upsertIngestedDocumentRecord(args: {
  sourceDocId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  contentHash: string;
  chunkTotal: number;
  collection: string;
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
    ingestedAt,
    metadata,
  } = args;

  getDb()
    .prepare(`
      INSERT INTO ingested_documents
        (source_doc_id, source_filename, file_type, file_size, content_hash, chunk_total, collection, ingested_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_doc_id) DO UPDATE SET chunk_total = excluded.chunk_total, ingested_at = excluded.ingested_at
    `)
    .run(
      sourceDocId,
      filename,
      fileType,
      fileSize,
      contentHash,
      chunkTotal,
      collection,
      ingestedAt,
      JSON.stringify(metadata)
    );
}
