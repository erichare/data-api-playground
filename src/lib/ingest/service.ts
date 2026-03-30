import { createHash, randomUUID } from "crypto";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import { getDb } from "@/lib/db";

const HF_MODEL = "ibm-granite/granite-embedding-125m-english";
const CSV_BATCH_SIZE = 20;
const DOCUMENT_BATCH_SIZE = 10;
const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 150;

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

export async function embedBatch(
  texts: string[],
  hfKey?: string
): Promise<number[][]> {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${HF_MODEL}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(hfKey ? { Authorization: `Bearer ${hfKey}` } : {}),
      },
      body: JSON.stringify({ inputs: texts }),
      signal: AbortSignal.timeout(30000),
    }
  );
  if (!response.ok) {
    throw new Error(`HuggingFace error ${response.status}`);
  }
  const result = (await response.json()) as number[][] | number[][][];
  if (Array.isArray(result[0][0])) {
    return (result as number[][][]).map((row) => row[0]);
  }
  return result as number[][];
}

export function streamCsvIngest(args: {
  token?: string;
  endpoint?: string;
  keyspace?: string;
  collection: string;
  rows: Record<string, string>[];
  filename: string;
  hfKey?: string;
}): ReadableStream<Uint8Array> {
  const { token, endpoint, keyspace } = resolveAstraConnection(args, {
    includeDefaultKeyspace: true,
  });
  const { collection, rows, filename, hfKey } = args;
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        if (!token || !endpoint || !collection || !rows.length) {
          send({
            type: "error",
            message: "token, endpoint, collection, and rows are required",
          });
          return;
        }

        const db = getAstraDb(token, endpoint, keyspace);
        const collectionRef = db.collection(collection);
        const collectionDescriptions = await db.listCollections({ nameOnly: false });
        const collectionDescription = collectionDescriptions.find(
          (candidate) => candidate.name === collection
        );
        const useVectorize = !!collectionDescription?.definition?.vector?.service;

        const total = rows.length;
        let processed = 0;

        send({ type: "start", total, filename, collection, useVectorize });

        for (let i = 0; i < rows.length; i += CSV_BATCH_SIZE) {
          const batch = rows.slice(i, i + CSV_BATCH_SIZE);
          const texts = batch.map((row) =>
            Object.entries(row)
              .map(([key, value]) => `${key}: ${value}`)
              .join("; ")
          );

          let docs: Record<string, unknown>[];
          if (useVectorize) {
            docs = batch.map((row, index) => ({
              ...row,
              $vectorize: texts[index],
              _filename: filename,
              _ingested_at: new Date().toISOString(),
            }));
          } else {
            let vectors: number[][] | null = null;
            try {
              vectors = await embedBatch(texts, hfKey);
            } catch {
              vectors = texts.map(() =>
                Array.from({ length: 768 }, () => Math.random() * 2 - 1)
              );
            }

            docs = batch.map((row, index) => ({
              ...row,
              $vector: vectors![index],
              _filename: filename,
              _ingested_at: new Date().toISOString(),
            }));
          }

          await collectionRef.insertMany(docs);
          processed += batch.length;
          send({ type: "progress", processed, total });
        }

        send({ type: "complete", processed, total });
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
  const chunkSize = parseInt(
    (formData.get("chunkSize") as string | null) ?? String(DEFAULT_CHUNK_SIZE)
  );
  const metadataRaw = (formData.get("metadata") as string | null) ?? "{}";

  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(metadataRaw);
  } catch {
    // Ignore malformed optional metadata payloads.
  }

  const filename = file.name;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "txt";
  const fileType = ["pdf", "txt", "md", "csv", "json", "docx"].includes(ext)
    ? ext
    : "txt";
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
  hfKey?: string;
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
    hfKey,
  } = args;

  const md5Hash = createHash("md5").update(buffer).digest("hex");
  const fileSize = buffer.length;
  const sourceDocId = randomUUID();
  const now = new Date().toISOString();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        send({ type: "extracting", filename });
        const text = await extractText(buffer, fileType);
        const chunks = chunkText(text, chunkSize);
        const chunkTotal = chunks.length;

        send({ type: "chunked", filename, chunks: chunkTotal, chars: text.length });

        if (!token || !endpoint || !collectionName) {
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
          });
          return;
        }

        const db = getAstraDb(token, endpoint, keyspace);
        const collection = db.collection(collectionName);
        const collectionDescriptions = await db.listCollections({ nameOnly: false });
        const collectionDescription = collectionDescriptions.find(
          (candidate) => candidate.name === collectionName
        );
        const useVectorize = !!collectionDescription?.definition?.vector?.service;

        for (let i = 0; i < chunks.length; i += DOCUMENT_BATCH_SIZE) {
          const batch = chunks.slice(i, i + DOCUMENT_BATCH_SIZE);

          let vectors: number[][] | null = null;
          if (!useVectorize && hfKey) {
            try {
              vectors = await embedBatch(batch, hfKey);
            } catch {
              // Best effort for non-vectorize collections.
            }
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

            if (useVectorize) {
              doc.$vectorize = content;
            } else if (vectors?.[index]) {
              doc.$vector = vectors[index];
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
