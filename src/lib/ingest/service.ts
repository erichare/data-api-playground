import { createHash, randomUUID } from "crypto";
import type { BackendConnectionInput } from "@/lib/backends/types";
import { resolveKnowledgeBackend } from "@/lib/knowledge";
import { createOpenragDocumentRef } from "@/lib/knowledge/openragBackend";
import type { KnowledgeBackendInput } from "@/lib/knowledge/types";
import {
  MAX_CSV_ROWS,
  MAX_DOCUMENT_CHUNKS,
  MAX_EXTRACTED_TEXT_CHARS,
} from "@/lib/ingest/constants";
import {
  deleteDocumentsForOverwrite,
  getLatestDuplicateByHash,
  insertIngestedDocumentRecord,
  listFilenameConflicts,
  replaceStoredDocumentChunks,
  upsertIngestedDocumentRecord,
} from "@/lib/ingest/repository";
import {
  chunkText,
  extractTabularRowChunks,
  extractText,
  parseDocumentUpload,
} from "@/lib/ingest/text";
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

function hasConnectedKnowledgeConfig(
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
 * Stream CSV row ingestion into an Astra DB collection via NDJSON progress events.
 *
 * Rows are batched, embedded (or $vectorize-tagged), and inserted in parallel.
 * Emits `start`, `progress`, `complete`, and `error` events. Supports both
 * server-side vectorize and client-side embedding via the resolved AI backend.
 *
 * @returns A `ReadableStream<Uint8Array>` of NDJSON-encoded progress events.
 */
export function streamCsvIngest(args: {
  backend?: BackendConnectionInput["backend"];
  token?: string;
  endpoint?: string;
  username?: string;
  password?: string;
  keyspace?: string;
  knowledgeBackend?: KnowledgeBackendInput["knowledgeBackend"];
  openragApiKey?: string;
  openragBaseUrl?: string;
  collection: string;
  rows: Record<string, string>[];
  filename: string;
  huggingfaceApiKey?: string;
}): ReadableStream<Uint8Array> {
  const { collection, rows, filename, huggingfaceApiKey } = args;
  const { config, backend } = resolveKnowledgeBackend(args, {
    includeDefaultKeyspace: true,
  });

  return createNdjsonStream(async (send) => {
    try {
      if (!hasConnectedKnowledgeConfig(config) || !collection || !rows.length) {
        const message =
          !("backend" in config)
            ? "OpenRAG API key, collection, and rows are required"
            : config.backend === "astra"
              ? "token, endpoint, collection, and rows are required"
              : "backend credentials, collection, and rows are required";
        send({
          type: "error",
          message,
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

      await backend.ingestCsv(
        {
          config,
          collection,
          rows,
          filename,
          huggingfaceApiKey,
        },
        send
      );
    } catch (err) {
      send({
        type: "error",
        message: err instanceof Error ? err.message : "Ingestion failed",
      });
    }
  });
}

/**
 * Stream document file ingestion (PDF, DOCX, TXT, etc.) into Astra DB.
 *
 * Extracts text, chunks it, detects duplicates by content hash, handles
 * filename conflicts (skip/overwrite), and inserts chunks with embeddings
 * or $vectorize annotations. Persists metadata to SQLite.
 *
 * Emits NDJSON events: `extracting`, `chunked`, `chunk_progress`, `complete`,
 * `skipped` (duplicate), `conflict` (name collision), or `error`.
 *
 * @returns A `ReadableStream<Uint8Array>` of NDJSON-encoded progress events.
 */
export function streamDocumentIngest(args: {
  filename: string;
  fileType: string;
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
    backend: backendKind,
    token,
    endpoint,
    username,
    password,
    keyspace,
    knowledgeBackend,
    openragApiKey,
    openragBaseUrl,
    chunkSize,
    metadata,
    buffer,
    huggingfaceApiKey,
    nameConflictAction,
  } = args;

  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const fileSize = buffer.length;
  const sourceDocId = randomUUID();
  const ingestedAt = new Date().toISOString();

  return createNdjsonStream(async (send) => {
    try {
      const persistedCollection = collectionName || "demo";
      const duplicateByHash = getLatestDuplicateByHash({
        collection: persistedCollection,
        contentHash,
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
          backend: backendKind,
          token,
          endpoint,
          username,
          password,
          keyspace,
          knowledgeBackend,
          openragApiKey,
          openragBaseUrl,
          existingDocuments: filenameConflicts,
        });
      }

      send({ type: "extracting", filename });
      const rowChunks = await extractTabularRowChunks(buffer, fileType);
      const text = rowChunks ? rowChunks.join("\n") : await extractText(buffer, fileType);
      if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
        throw new Error(
          `Extracted text exceeds ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters`
        );
      }
      const chunks = rowChunks ?? chunkText(text, chunkSize);
      const chunkTotal = chunks.length;
      const chunkLimit = rowChunks ? MAX_CSV_ROWS : MAX_DOCUMENT_CHUNKS;
      if (chunkTotal > chunkLimit) {
        throw new Error(
          rowChunks
            ? `Tabular uploads support at most ${MAX_CSV_ROWS.toLocaleString()} rows per file`
            : `Document exceeds ${MAX_DOCUMENT_CHUNKS.toLocaleString()} chunks`
        );
      }

      if (
        (!backendKind || backendKind === "astra"
          ? !token || !endpoint
          : !endpoint || !username || !password) ||
        !collectionName
      ) {
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
          contentHash,
          chunkTotal,
          collection: persistedCollection,
          backendKind: backendKind ?? "astra",
          backendSource: persistedCollection,
          backendDocumentRef: sourceDocId,
          ingestedAt,
          metadata,
        });

        send({
          type: "complete",
          source_doc_id: sourceDocId,
          chunks: chunkTotal,
          collection: collectionName,
          demo: true,
          content_hash: contentHash,
          replaced_source_doc_ids: replacedSourceDocIds,
        });
        return;
      }

      const { config, backend } = resolveKnowledgeBackend(
        {
          backend: backendKind,
          token,
          endpoint,
          username,
          password,
          keyspace,
          knowledgeBackend,
          openragApiKey,
          openragBaseUrl,
        } as KnowledgeBackendInput,
        { includeDefaultKeyspace: true }
      );
      let backendProvider: string | undefined;
      let backendModel: string | undefined;

      await backend.ingestDocument(
        {
          config,
          sourceDocId,
          collectionName,
          filename,
          fileType,
          text,
          fileBytes: buffer,
          chunks,
          metadata,
          huggingfaceApiKey,
        },
        (event) => {
          if (event.type === "backend_info") {
            backendProvider =
              typeof event.provider === "string" ? event.provider : undefined;
            backendModel = typeof event.model === "string" ? event.model : undefined;
            send({
              type: "chunked",
              filename,
              chunks: chunkTotal,
              chars: text.length,
              useVectorize: event.useVectorize === true,
              provider: backendProvider,
              model: backendModel,
            });
            return;
          }

          if (event.type === "backend_complete") {
            backendProvider =
              typeof event.provider === "string" ? event.provider : backendProvider;
            backendModel =
              typeof event.model === "string" ? event.model : backendModel;
            return;
          }

          send(event);
        }
      );

      if (backend.kind === "openrag") {
        replaceStoredDocumentChunks({
          sourceDocId,
          chunks,
        });
      }

      upsertIngestedDocumentRecord({
        sourceDocId,
        filename,
        fileType,
        fileSize,
        contentHash,
        chunkTotal,
        collection: collectionName,
        backendKind: backend.kind,
        backendSource: collectionName,
        backendDocumentRef:
          backend.kind === "openrag"
            ? createOpenragDocumentRef({ filename, sourceDocId })
            : sourceDocId,
        ingestedAt,
        metadata,
      });

      send({
        type: "complete",
        source_doc_id: sourceDocId,
        chunks: chunkTotal,
        collection: collectionName,
        provider: backendProvider,
        model: backendModel,
        content_hash: contentHash,
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
