import { NextRequest } from "next/server";
import { createHash, randomUUID } from "crypto";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const HF_MODEL = "ibm-granite/granite-embedding-125m-english";
const BATCH_SIZE = 10;
const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 150;

// ── Text extraction ───────────────────────────────────────────────────────────

async function extractText(buffer: Buffer, fileType: string): Promise<string> {
  switch (fileType) {
    case "pdf": {
      // pdf-parse v2 bundles its own pdfjs and exposes a class-based API.
      // Use { data: Uint8Array } to parse from a buffer — no worker, no DOMMatrix issues.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require("pdf-parse") as { PDFParse: new (opts: { data: Uint8Array }) => { getText: () => Promise<{ text: string }> } };
      const result = await new PDFParse({ data: new Uint8Array(buffer) }).getText();
      return result.text;
    }
    case "docx": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> };
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
      // txt, md, csv — raw text
      return buffer.toString("utf-8");
  }
}

// ── Chunking ─────────────────────────────────────────────────────────────────

function chunkText(text: string, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP): string[] {
  // Split on paragraph breaks first, then by sentence within oversized paragraphs
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length === 0) {
      current = para;
    } else if (current.length + 2 + para.length <= chunkSize) {
      current += "\n\n" + para;
    } else {
      if (current.length > 0) chunks.push(current.trim());
      if (para.length > chunkSize) {
        // Hard-split long paragraphs with overlap
        for (let i = 0; i < para.length; i += chunkSize - overlap) {
          const slice = para.slice(i, i + chunkSize).trim();
          if (slice.length > 20) chunks.push(slice);
        }
        current = "";
      } else {
        current = para;
      }
    }
  }

  if (current.trim().length > 20) chunks.push(current.trim());
  return chunks;
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embedBatch(texts: string[], hfKey?: string): Promise<number[][]> {
  const res = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(hfKey ? { Authorization: `Bearer ${hfKey}` } : {}),
    },
    body: JSON.stringify({ inputs: texts }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HuggingFace error ${res.status}`);
  const result = (await res.json()) as number[][] | number[][][];
  if (Array.isArray(result[0][0])) return (result as number[][][]).map((r) => r[0]);
  return result as number[][];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const file = formData.get("file") as File | null;
  if (!file) {
    return new Response(JSON.stringify({ error: "No file provided" }), { status: 400 });
  }

  const collectionName = (formData.get("collection") as string | null) ?? "";
  const { token, endpoint, keyspace } = resolveAstraConnection({
    token: (formData.get("token") as string | null) ?? undefined,
    endpoint: (formData.get("endpoint") as string | null) ?? undefined,
    keyspace: (formData.get("keyspace") as string | null) ?? undefined,
  }, { includeDefaultKeyspace: true });
  const chunkSize = parseInt((formData.get("chunkSize") as string | null) ?? String(DEFAULT_CHUNK_SIZE));
  const metadataRaw = (formData.get("metadata") as string | null) ?? "{}";

  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(metadataRaw); } catch { /* ignore */ }

  const filename = file.name;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "txt";
  const fileType = ["pdf", "txt", "md", "csv", "json", "docx"].includes(ext) ? ext : "txt";

  const buffer = Buffer.from(await file.arrayBuffer());
  const md5Hash = createHash("md5").update(buffer).digest("hex");
  const fileSize = buffer.length;
  const sourceDocId = randomUUID();
  const now = new Date().toISOString();

  const encoder = new TextEncoder();
  const hfKey = process.env.HUGGINGFACE_API_KEY;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        // 1. Extract text
        send({ type: "extracting", filename });
        const text = await extractText(buffer, fileType);

        // 2. Chunk
        const chunks = chunkText(text, chunkSize);
        const chunkTotal = chunks.length;
        send({ type: "chunked", filename, chunks: chunkTotal, chars: text.length });

        if (!token || !endpoint || !collectionName) {
          // Demo mode — simulate progress, still save metadata locally
          for (let i = 0; i < chunkTotal; i++) {
            await new Promise((r) => setTimeout(r, 40));
            send({ type: "chunk_progress", processed: i + 1, total: chunkTotal });
          }
          // Persist metadata to SQLite even in demo mode
          getDb().prepare(`
            INSERT INTO ingested_documents
              (source_doc_id, source_filename, file_type, file_size, md5_hash, chunk_total, collection, ingested_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(sourceDocId, filename, fileType, fileSize, md5Hash, chunkTotal, collectionName || "demo", now, JSON.stringify(metadata));

          send({ type: "complete", source_doc_id: sourceDocId, chunks: chunkTotal, collection: collectionName, demo: true });
          controller.close();
          return;
        }

        // 3. Connect to Astra
        const db = getAstraDb(token, endpoint, keyspace);
        const coll = db.collection(collectionName);

        // Detect vectorize service
        const collDescs = await db.listCollections({ nameOnly: false });
        const collDesc = collDescs.find((c) => c.name === collectionName);
        const useVectorize = !!collDesc?.definition?.vector?.service;

        // 4. Insert chunks in batches
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
          const batch = chunks.slice(i, i + BATCH_SIZE);

          let vectors: number[][] | null = null;
          if (!useVectorize && hfKey) {
            try {
              vectors = await embedBatch(batch, hfKey);
            } catch {
              // fallback: skip vectors for this batch
            }
          }

          const docs = batch.map((content, j) => {
            const idx = i + j;
            const doc: Record<string, unknown> = {
              _id: randomUUID(),
              content,
              metadata: {
                source_doc_id: sourceDocId,
                chunk_index: idx,
                ...metadata,
              },
            };

            if (useVectorize) {
              doc.$vectorize = content;
            } else if (vectors?.[j]) {
              doc.$vector = vectors[j];
            }

            return doc;
          });

          await coll.insertMany(docs);
          send({ type: "chunk_progress", processed: Math.min(i + BATCH_SIZE, chunkTotal), total: chunkTotal });
        }

        // Save document metadata to SQLite
        getDb().prepare(`
          INSERT INTO ingested_documents
            (source_doc_id, source_filename, file_type, file_size, md5_hash, chunk_total, collection, ingested_at, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_doc_id) DO UPDATE SET chunk_total = excluded.chunk_total, ingested_at = excluded.ingested_at
        `).run(sourceDocId, filename, fileType, fileSize, md5Hash, chunkTotal, collectionName, now, JSON.stringify(metadata));

        send({ type: "complete", source_doc_id: sourceDocId, chunks: chunkTotal, collection: collectionName });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Ingestion failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Transfer-Encoding": "chunked" },
  });
}
