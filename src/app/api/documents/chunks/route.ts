import { NextRequest, NextResponse } from "next/server";
import { DataAPIClient } from "@datastax/astra-db-ts";

export const runtime = "nodejs";

// GET /api/documents/chunks?source_doc_id=...&collection=...&token=...&endpoint=...&keyspace=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sourceDocId = searchParams.get("source_doc_id") ?? "";
  const collection = searchParams.get("collection") ?? "";
  const token = searchParams.get("token") ?? process.env.ASTRA_DB_APPLICATION_TOKEN ?? "";
  const rawEndpoint = searchParams.get("endpoint") ?? process.env.ASTRA_DB_API_ENDPOINT ?? "";
  const endpoint = rawEndpoint.replace(/\/$/, "");
  const keyspace = searchParams.get("keyspace") ?? "default_keyspace";

  if (!sourceDocId || !collection) {
    return NextResponse.json({ error: "source_doc_id and collection are required" }, { status: 400 });
  }

  if (!token || !endpoint) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  try {
    const client = new DataAPIClient(token);
    const db = client.db(endpoint, { keyspace });
    const coll = db.collection(collection);

    const cursor = coll.find(
      { "metadata.source_doc_id": { $eq: sourceDocId } },
      {
        projection: { content: 1, metadata: 1 },
        limit: 1000,
      }
    );

    const chunks: Array<{ chunk_index: number; content: string }> = [];
    for await (const doc of cursor) {
      const meta = doc.metadata as Record<string, unknown>;
      chunks.push({ chunk_index: meta.chunk_index as number, content: doc.content as string });
    }

    chunks.sort((a, b) => a.chunk_index - b.chunk_index);

    return NextResponse.json({ chunks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load chunks" },
      { status: 500 }
    );
  }
}
