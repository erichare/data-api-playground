import { createHash, randomUUID } from "crypto";
import { embedMany, ensureModel } from "@/lib/ai/service";
import {
  buildTsCall,
  formatTsMethodCall,
  rawTs,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import { resolveAstraConnection } from "@/lib/astra";
import {
  CSV_BATCH_SIZE,
  DOCUMENT_BATCH_SIZE,
  MAX_CSV_ROWS,
  MAX_DOCUMENT_CHUNKS,
  MAX_EXTRACTED_TEXT_CHARS,
} from "@/lib/ingest/constants";
import {
  resolveIngestCollectionContext,
  validateVectorDimension,
} from "@/lib/ingest/backend";
import { createPrepareTracker } from "@/lib/ingest/prepare";
import {
  deleteDocumentsForOverwrite,
  getLatestDuplicateByHash,
  insertIngestedDocumentRecord,
  listFilenameConflicts,
  upsertIngestedDocumentRecord,
} from "@/lib/ingest/repository";
import { chunkText, extractText, parseDocumentUpload } from "@/lib/ingest/text";
import type { NameConflictAction } from "@/lib/ingest/types";

export { chunkText, extractText, parseDocumentUpload };

function createNdjsonStream(
  run: (send: (event: Record<string, unknown>) => void) => Promise<void>
) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        await run(send);
      } finally {
        controller.close();
      }
    },
  });
}

export function streamCsvIngest(args: {
  token?: string;
  endpoint?: string;
  keyspace?: string;
  collection: string;
  rows: Record<string, string>[];
  filename: string;
  huggingfaceApiKey?: string;
}): ReadableStream<Uint8Array> {
  const { token, endpoint, keyspace } = resolveAstraConnection(args, {
    includeDefaultKeyspace: true,
  });
  const { collection, rows, filename, huggingfaceApiKey } = args;

  return createNdjsonStream(async (send) => {
    const withPrepareTracking = createPrepareTracker(send);

    try {
      if (!token || !endpoint || !collection || !rows.length) {
        send({
          type: "error",
          message: "token, endpoint, collection, and rows are required",
        });
        return;
      }
      if (rows.length > MAX_CSV_ROWS) {
        send({
          type: "error",
          message: `CSV ingest supports at most ${MAX_CSV_ROWS.toLocaleString()} rows per request`,
        });
        return;
      }

      const { collection: collectionRef, collectionConfig, backend, backendHint } =
        await resolveIngestCollectionContext({
          token,
          endpoint,
          keyspace,
          collectionName: collection,
          huggingfaceApiKey,
        });

      if (backend) {
        await withPrepareTracking({
          backend,
          kind: "embed",
          task: (onPrepareProgress) =>
            ensureModel({
              backend,
              kind: "embed",
              allowPull: true,
              onProgress: onPrepareProgress,
            }),
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
    } catch (err) {
      send({
        type: "error",
        message: err instanceof Error ? err.message : "Ingestion failed",
      });
    }
  });
}

export function streamDocumentIngest(args: {
  filename: string;
  fileType: string;
  collectionName: string;
  token?: string;
  endpoint?: string;
  keyspace?: string;
  chunkSize: number;
  metadata: Record<string, unknown>;
  buffer: Buffer;
  huggingfaceApiKey?: string;
  nameConflictAction?: NameConflictAction;
}): ReadableStream<Uint8Array> {
  const {
    filename,
    fileType,
    collectionName,
    token,
    endpoint,
    keyspace,
    chunkSize,
    metadata,
    buffer,
    huggingfaceApiKey,
    nameConflictAction,
  } = args;

  const md5Hash = createHash("md5").update(buffer).digest("hex");
  const fileSize = buffer.length;
  const sourceDocId = randomUUID();
  const ingestedAt = new Date().toISOString();

  return createNdjsonStream(async (send) => {
    const withPrepareTracking = createPrepareTracker(send);

    try {
      const persistedCollection = collectionName || "demo";
      const duplicateByHash = getLatestDuplicateByHash({
        collection: persistedCollection,
        md5Hash,
      });

      if (duplicateByHash) {
        send({
          type: "skipped",
          reason: "duplicate_hash",
          source_doc_id: duplicateByHash.source_doc_id,
          message: `Already ingested as "${duplicateByHash.source_filename}" on ${new Date(
            duplicateByHash.ingested_at
          ).toLocaleString("en-US")}; skipping duplicate upload.`,
        });
        return;
      }

      const filenameConflicts = listFilenameConflicts({
        collection: persistedCollection,
        filename,
      });

      if (filenameConflicts.length > 0 && nameConflictAction !== "overwrite") {
        if (nameConflictAction === "skip") {
          send({
            type: "skipped",
            reason: "name_conflict",
            source_doc_id: filenameConflicts[0]?.source_doc_id,
            message: `Skipped "${filename}" because a different file with that name is already in this collection.`,
          });
          return;
        }

        send({
          type: "conflict",
          reason: "name_conflict",
          existing_count: filenameConflicts.length,
          existing_source_doc_id: filenameConflicts[0]?.source_doc_id,
          existing_ingested_at: filenameConflicts[0]?.ingested_at,
          message:
            filenameConflicts.length === 1
              ? `A different "${filename}" is already ingested in this collection. Overwrite it or skip this upload.`
              : `There are ${filenameConflicts.length} different files named "${filename}" in this collection. Overwrite them or skip this upload.`,
        });
        return;
      }

      let replacedSourceDocIds: string[] = [];
      if (filenameConflicts.length > 0 && nameConflictAction === "overwrite") {
        replacedSourceDocIds = filenameConflicts.map(
          (existingDocument) => existingDocument.source_doc_id
        );
        await deleteDocumentsForOverwrite({
          collectionName: persistedCollection,
          token,
          endpoint,
          keyspace,
          existingDocuments: filenameConflicts,
        });
      }

      send({ type: "extracting", filename });
      const text = await extractText(buffer, fileType);
      if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
        throw new Error(
          `Extracted text exceeds ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters`
        );
      }
      const chunks = chunkText(text, chunkSize);
      const chunkTotal = chunks.length;
      if (chunkTotal > MAX_DOCUMENT_CHUNKS) {
        throw new Error(
          `Document exceeds ${MAX_DOCUMENT_CHUNKS.toLocaleString()} chunks`
        );
      }

      if (!token || !endpoint || !collectionName) {
        send({ type: "chunked", filename, chunks: chunkTotal, chars: text.length });

        for (let index = 0; index < chunkTotal; index += 1) {
          await new Promise((resolve) => setTimeout(resolve, 40));
          send({ type: "chunk_progress", processed: index + 1, total: chunkTotal });
        }

        insertIngestedDocumentRecord({
          sourceDocId,
          filename,
          fileType,
          fileSize,
          md5Hash,
          chunkTotal,
          collection: persistedCollection,
          ingestedAt,
          metadata,
        });

        send({
          type: "complete",
          source_doc_id: sourceDocId,
          chunks: chunkTotal,
          collection: collectionName,
          demo: true,
          md5_hash: md5Hash,
          replaced_source_doc_ids: replacedSourceDocIds,
        });
        return;
      }

      const { collection, collectionConfig, backend, backendHint } =
        await resolveIngestCollectionContext({
          token,
          endpoint,
          keyspace,
          collectionName,
          huggingfaceApiKey,
        });

      if (backend) {
        await withPrepareTracking({
          backend,
          kind: "embed",
          task: (onPrepareProgress) =>
            ensureModel({
              backend,
              kind: "embed",
              allowPull: true,
              onProgress: onPrepareProgress,
            }),
        });
      }

      send({
        type: "chunked",
        filename,
        chunks: chunkTotal,
        chars: text.length,
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

        recordAstraClientCall({
          label: "Ingest Knowledge",
          code: buildTsCall(`db.collection(${JSON.stringify(collectionName)})`, [
            formatTsMethodCall("insertMany", [
              rawTs(`docsBatch /* ${docs.length} chunks */`),
            ]),
          ]),
        });
        await collection.insertMany(docs);
        send({
          type: "chunk_progress",
          processed: Math.min(index + DOCUMENT_BATCH_SIZE, chunkTotal),
          total: chunkTotal,
        });
      }

      upsertIngestedDocumentRecord({
        sourceDocId,
        filename,
        fileType,
        fileSize,
        md5Hash,
        chunkTotal,
        collection: collectionName,
        ingestedAt,
        metadata,
      });

      send({
        type: "complete",
        source_doc_id: sourceDocId,
        chunks: chunkTotal,
        collection: collectionName,
        provider: backendHint.provider,
        model: backendHint.model,
        md5_hash: md5Hash,
        replaced_source_doc_ids: replacedSourceDocIds,
      });
    } catch (err) {
      send({
        type: "error",
        message: err instanceof Error ? err.message : "Ingestion failed",
      });
    }
  });
}
