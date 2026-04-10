import { createHash, randomUUID } from "crypto";
import {
  embedMany,
  ensureModel,
  resolveBackend,
  type EnsureModelProgress,
  type ResolvedAiBackend,
} from "@/lib/ai/service";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import { getDb } from "@/lib/db";
import {
  MAX_DOCUMENT_UPLOAD_BYTES,
  MAX_DOCUMENT_UPLOAD_MB,
} from "@/lib/ingest/constants";

const CSV_BATCH_SIZE = 20;
const DOCUMENT_BATCH_SIZE = 10;
const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 150;
const MAX_EXTRACTED_TEXT_CHARS = 1_000_000;
const MAX_DOCUMENT_CHUNKS = 500;
const MIN_CHUNK_SIZE = 200;
const MAX_CHUNK_SIZE = 4_000;
const MAX_CSV_ROWS = 5_000;
const MAX_METADATA_BYTES = 16 * 1024;

type CollectionDescription = {
  name: string;
  definition?: {
    vector?: {
      dimension?: number | null;
      service?: {
        provider?: string;
        modelName?: string;
      } | null;
    } | null;
  } | null;
};

type IngestBackendHint = {
  provider: string;
  model: string;
};

type ExistingIngestedDocument = {
  source_doc_id: string;
  source_filename: string;
  md5_hash: string;
  ingested_at: string;
  collection: string;
};

type NameConflictAction = "overwrite" | "skip";

type IngestPrepareEvent =
  | {
      type: "prepare";
      status: "running";
      provider: string;
      model: string;
      kind: "chat" | "embed";
      message: string;
      completed?: number;
      total?: number;
      determinate: boolean;
    }
  | {
      type: "prepare";
      status: "complete";
      provider: string;
      model: string;
      kind: "chat" | "embed";
      downloaded: boolean;
      latencyMs: number;
    };

function createPrepareTracker(
  send: (event: Record<string, unknown> | IngestPrepareEvent) => void
) {
  return async function withPrepareTracking<T>(args: {
    backend: ResolvedAiBackend;
    kind: "chat" | "embed";
    task: (onPrepareProgress: (progress: EnsureModelProgress) => void) => Promise<T>;
  }): Promise<T> {
    const { backend, kind, task } = args;
    if (backend.provider !== "ollama") {
      return task(() => undefined);
    }

    const prepareStart = Date.now();
    let sawProgress = false;
    let downloaded = false;
    let finalModel = kind === "chat" ? backend.chatModel : backend.embedModel;

    const onPrepareProgress = (progress: EnsureModelProgress) => {
      sawProgress = true;
      finalModel = progress.model;
      if (progress.status !== "Model already installed") {
        downloaded = true;
      }

      send({
        type: "prepare",
        status: "running",
        provider: progress.provider,
        model: progress.model,
        kind: progress.kind,
        message: progress.status,
        ...(typeof progress.completed === "number"
          ? { completed: progress.completed }
          : {}),
        ...(typeof progress.total === "number" ? { total: progress.total } : {}),
        determinate: progress.determinate,
      });
    };

    const result = await task(onPrepareProgress);

    if (sawProgress) {
      send({
        type: "prepare",
        status: "complete",
        provider: backend.provider,
        model: finalModel,
        kind,
        downloaded,
        latencyMs: Date.now() - prepareStart,
      });
    }

    return result;
    };
}

function getLatestDuplicateByHash(args: {
  collection: string;
  md5Hash: string;
}): ExistingIngestedDocument | undefined {
  return getDb()
    .prepare(
      `
        SELECT source_doc_id, source_filename, md5_hash, ingested_at, collection
        FROM ingested_documents
        WHERE collection = ? AND md5_hash = ?
        ORDER BY ingested_at DESC
        LIMIT 1
      `
    )
    .get(args.collection, args.md5Hash) as ExistingIngestedDocument | undefined;
}

function listFilenameConflicts(args: {
  collection: string;
  filename: string;
}): ExistingIngestedDocument[] {
  return getDb()
    .prepare(
      `
        SELECT source_doc_id, source_filename, md5_hash, ingested_at, collection
        FROM ingested_documents
        WHERE collection = ? AND source_filename = ?
        ORDER BY ingested_at DESC
      `
    )
    .all(args.collection, args.filename) as ExistingIngestedDocument[];
}

async function deleteDocumentsForOverwrite(args: {
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

function getCollectionConfig(description: CollectionDescription | undefined) {
  const vectorDef = description?.definition?.vector;
  const service = vectorDef?.service ?? null;

  return {
    useVectorize: !!service,
    vectorDimension: vectorDef?.dimension ?? null,
    vectorizeProvider: service?.provider ?? "astra",
    vectorizeModel: service?.modelName ?? "server-side vectorize",
  };
}

function getBackendHint(
  description: CollectionDescription | undefined,
  backend: ResolvedAiBackend | null
): IngestBackendHint {
  const config = getCollectionConfig(description);

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

function validateVectorDimension(args: {
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

export function chunkText(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP
): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current.length === 0) {
      current = paragraph;
    } else if (current.length + 2 + paragraph.length <= chunkSize) {
      current += `\n\n${paragraph}`;
    } else {
      if (current.length > 0) chunks.push(current.trim());
      if (paragraph.length > chunkSize) {
        for (let i = 0; i < paragraph.length; i += chunkSize - overlap) {
          const slice = paragraph.slice(i, i + chunkSize).trim();
          if (slice.length > 20) chunks.push(slice);
        }
        current = "";
      } else {
        current = paragraph;
      }
    }
  }

  if (current.trim().length > 20) chunks.push(current.trim());
  return chunks;
}

export async function extractText(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  switch (fileType) {
    case "pdf": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require("pdf-parse") as {
        PDFParse: new (opts: {
          data: Uint8Array;
        }) => { getText: () => Promise<{ text: string }> };
      };
      const result = await new PDFParse({
        data: new Uint8Array(buffer),
      }).getText();
      return result.text;
    }
    case "docx": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "json": {
      try {
        const parsed = JSON.parse(buffer.toString("utf-8"));
        return JSON.stringify(parsed, null, 2);
      } catch {
        return buffer.toString("utf-8");
      }
    }
    default:
      return buffer.toString("utf-8");
  }
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
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown> | IngestPrepareEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
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

        const db = getAstraDb(token, endpoint, keyspace);
        const collectionRef = db.collection(collection);
        const collectionDescriptions = (await db.listCollections({
          nameOnly: false,
        })) as CollectionDescription[];
        const collectionDescription = collectionDescriptions.find(
          (candidate) => candidate.name === collection
        );
        const collectionConfig = getCollectionConfig(collectionDescription);
        const backend = collectionConfig.useVectorize
          ? null
          : resolveBackend({ huggingfaceApiKey });
        const backendHint = getBackendHint(collectionDescription, backend);

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

        for (let i = 0; i < rows.length; i += CSV_BATCH_SIZE) {
          const batch = rows.slice(i, i + CSV_BATCH_SIZE);
          const texts = batch.map((row) =>
            Object.entries(row)
              .map(([key, value]) => `${key}: ${value}`)
              .join("; ")
          );

          const docs = collectionConfig.useVectorize
            ? batch.map((row, index) => ({
                ...row,
                $vectorize: texts[index],
                _filename: filename,
                _ingested_at: new Date().toISOString(),
              }))
            : await (async () => {
                const embeddings = (
                  await embedMany({
                    backend: backend!,
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

                return batch.map((row, index) => ({
                  ...row,
                  $vector: embeddings[index],
                  _filename: filename,
                  _ingested_at: new Date().toISOString(),
                }));
              })();

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
      } finally {
        controller.close();
      }
    },
  });
}

export async function parseDocumentUpload(formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file) {
    throw new Error("No file provided");
  }

  const collectionName = (formData.get("collection") as string | null) ?? "";
  const { token, endpoint, keyspace } = resolveAstraConnection(
    {
      token: (formData.get("token") as string | null) ?? undefined,
      endpoint: (formData.get("endpoint") as string | null) ?? undefined,
      keyspace: (formData.get("keyspace") as string | null) ?? undefined,
    },
    { includeDefaultKeyspace: true }
  );
  const requestedChunkSize = parseInt(
    (formData.get("chunkSize") as string | null) ?? String(DEFAULT_CHUNK_SIZE)
  );
  const metadataRaw = (formData.get("metadata") as string | null) ?? "{}";
  const chunkSize = Number.isFinite(requestedChunkSize)
    ? Math.min(Math.max(requestedChunkSize, MIN_CHUNK_SIZE), MAX_CHUNK_SIZE)
    : DEFAULT_CHUNK_SIZE;
  const huggingfaceApiKey =
    (formData.get("huggingfaceApiKey") as string | null) ?? undefined;
  const nameConflictActionRaw =
    (formData.get("nameConflictAction") as string | null) ?? undefined;
  const nameConflictAction =
    nameConflictActionRaw === "overwrite" || nameConflictActionRaw === "skip"
      ? nameConflictActionRaw
      : undefined;

  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(metadataRaw);
  } catch {
    // Ignore malformed optional metadata payloads.
  }
  if (metadataRaw.length > MAX_METADATA_BYTES) {
    throw new Error(
      `Metadata payload exceeds ${MAX_METADATA_BYTES.toLocaleString()} bytes`
    );
  }

  const filename = file.name;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "txt";
  const fileType = ["pdf", "txt", "md", "csv", "json", "docx"].includes(ext)
    ? ext
    : "txt";
  if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${MAX_DOCUMENT_UPLOAD_MB} MB upload limit`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  return {
    file,
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
  };
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
  const now = new Date().toISOString();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown> | IngestPrepareEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const withPrepareTracking = createPrepareTracker(send);

      try {
        const duplicateByHash = getLatestDuplicateByHash({
          collection: collectionName || "demo",
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
          collection: collectionName || "demo",
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
            collectionName: collectionName || "demo",
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

          for (let i = 0; i < chunkTotal; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 40));
            send({ type: "chunk_progress", processed: i + 1, total: chunkTotal });
          }

          getDb()
            .prepare(`
              INSERT INTO ingested_documents
                (source_doc_id, source_filename, file_type, file_size, md5_hash, chunk_total, collection, ingested_at, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              sourceDocId,
              filename,
              fileType,
              fileSize,
              md5Hash,
              chunkTotal,
              collectionName || "demo",
              now,
              JSON.stringify(metadata)
            );

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

        const db = getAstraDb(token, endpoint, keyspace);
        const collection = db.collection(collectionName);
        const collectionDescriptions = (await db.listCollections({
          nameOnly: false,
        })) as CollectionDescription[];
        const collectionDescription = collectionDescriptions.find(
          (candidate) => candidate.name === collectionName
        );
        const collectionConfig = getCollectionConfig(collectionDescription);
        const backend = collectionConfig.useVectorize
          ? null
          : resolveBackend({ huggingfaceApiKey });
        const backendHint = getBackendHint(collectionDescription, backend);

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

        for (let i = 0; i < chunks.length; i += DOCUMENT_BATCH_SIZE) {
          const batch = chunks.slice(i, i + DOCUMENT_BATCH_SIZE);

          const embeddings = collectionConfig.useVectorize
            ? null
            : (
                await embedMany({
                  backend: backend!,
                  input: batch,
                  allowPull: false,
                  skipEnsure: true,
                })
              ).embeddings;

          if (embeddings) {
            validateVectorDimension({
              collection: collectionName,
              expected: collectionConfig.vectorDimension,
              embeddings,
            });
          }

          const docs = batch.map((content, index) => {
            const chunkIndex = i + index;
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
              doc.$vector = embeddings![index];
            }

            return doc;
          });

          await collection.insertMany(docs);
          send({
            type: "chunk_progress",
            processed: Math.min(i + DOCUMENT_BATCH_SIZE, chunkTotal),
            total: chunkTotal,
          });
        }

        getDb()
          .prepare(`
            INSERT INTO ingested_documents
              (source_doc_id, source_filename, file_type, file_size, md5_hash, chunk_total, collection, ingested_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_doc_id) DO UPDATE SET chunk_total = excluded.chunk_total, ingested_at = excluded.ingested_at
          `)
          .run(
            sourceDocId,
            filename,
            fileType,
            fileSize,
            md5Hash,
            chunkTotal,
            collectionName,
            now,
            JSON.stringify(metadata)
          );

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
      } finally {
        controller.close();
      }
    },
  });
}
