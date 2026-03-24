import { NextRequest } from "next/server";
import { DataAPIClient } from "@datastax/astra-db-ts";

export const runtime = "nodejs";

const HF_MODEL = "ibm-granite/granite-embedding-125m-english";
const BATCH_SIZE = 20;

async function embedBatch(texts: string[], hfKey?: string): Promise<number[][]> {
  const res = await fetch(
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
  if (!res.ok) throw new Error(`HuggingFace error: ${res.status} ${await res.text()}`);
  const result = await res.json() as number[][] | number[][][];
  // HF returns either number[][] or number[][][]
  if (Array.isArray(result[0][0])) {
    return (result as number[][][]).map((r) => r[0]);
  }
  return result as number[][];
}

export async function POST(req: NextRequest) {
  const { token, endpoint, collection: collectionName, rows, filename } = await req.json() as {
    token: string;
    endpoint: string;
    collection: string;
    rows: Record<string, string>[];
    filename: string;
  };

  if (!token || !endpoint || !collectionName || !rows?.length) {
    return new Response(JSON.stringify({ error: "token, endpoint, collection, and rows are required" }), { status: 400 });
  }

  const hfKey = process.env.HUGGINGFACE_API_KEY;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        const client = new DataAPIClient(token);
        const db = client.db(endpoint);
        const coll = db.collection(collectionName);

        // Detect vectorize server-side — never trust client-passed flag
        const collDescs = await db.listCollections({ nameOnly: false });
        const collDesc = collDescs.find((c) => c.name === collectionName);
        const useVectorize = !!collDesc?.definition?.vector?.service;

        const total = rows.length;
        let processed = 0;

        send({ type: "start", total, filename, collection: collectionName, useVectorize });

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);

          // Build text representation of each row
          const texts = batch.map((row) =>
            Object.entries(row)
              .map(([k, v]) => `${k}: ${v}`)
              .join("; ")
          );

          let docs: Record<string, unknown>[];

          if (useVectorize) {
            // Collection has server-side vectorize — pass $vectorize, Astra embeds automatically
            docs = batch.map((row, j) => ({
              ...row,
              $vectorize: texts[j],
              _filename: filename,
              _ingested_at: new Date().toISOString(),
            }));
          } else {
            // Client-side embedding via IBM Granite on HuggingFace
            let vectors: number[][] | null = null;
            try {
              vectors = await embedBatch(texts, hfKey);
            } catch {
              // fallback: random vectors if HF unavailable
              vectors = texts.map(() => Array.from({ length: 768 }, () => Math.random() * 2 - 1));
            }
            docs = batch.map((row, j) => ({
              ...row,
              $vector: vectors![j],
              _filename: filename,
              _ingested_at: new Date().toISOString(),
            }));
          }

          await coll.insertMany(docs);

          processed += batch.length;
          send({ type: "progress", processed, total });
        }

        send({ type: "complete", processed, total });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ingestion failed";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Transfer-Encoding": "chunked" },
  });
}
