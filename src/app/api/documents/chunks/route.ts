import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/documents/chunks
export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = await req.json() as {
    source_doc_id?: string;
    collection?: string;
    token?: string;
    endpoint?: string;
    keyspace?: string;
  };
  const sourceDocId = body.source_doc_id ?? "";
  const collection = body.collection ?? "";
  const { token, endpoint, keyspace } = resolveAstraConnection(body, { includeDefaultKeyspace: true });

  if (!sourceDocId || !collection) {
    return NextResponse.json({ error: "source_doc_id and collection are required" }, { status: 400 });
  }

  if (!token || !endpoint) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);
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
