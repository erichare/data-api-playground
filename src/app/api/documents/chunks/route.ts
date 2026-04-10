import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import {
  formatTsMethodCall,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { documentsChunksBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

// POST /api/documents/chunks
export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, documentsChunksBodySchema);
  if (isErrorResponse(result)) return result;
  const { source_doc_id: sourceDocId, collection } = result;
  const { token, endpoint, keyspace } = resolveAstraConnection(result, { includeDefaultKeyspace: true });

  if (!token || !endpoint) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);
    const coll = db.collection(collection);
    const findCall = formatTsMethodCall("find", [
      { "metadata.source_doc_id": { $eq: sourceDocId } },
      {
        projection: { content: 1, metadata: 1 },
        limit: 1000,
      },
    ]);
    recordAstraClientCall({
      label: "Load Document Chunks",
      code: [
        `const cursor = db.collection(${JSON.stringify(collection)})`,
        `  ${findCall};`,
        "",
        "for await (const doc of cursor) {",
        "  // collect content and metadata",
        "}",
      ].join("\n"),
    });

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
