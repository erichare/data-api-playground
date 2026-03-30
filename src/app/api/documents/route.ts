import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import { getDb } from "@/lib/db";
import type { IngestedDocumentSummary } from "@/lib/types";

export const runtime = "nodejs";

type DocRow = {
  source_doc_id: string; source_filename: string; file_type: string;
  file_size: number; md5_hash: string; chunk_total: number;
  collection: string; ingested_at: string;
};

// GET /api/documents — list ingested document summaries from SQLite, optionally filtered by collection
export async function GET(req: NextRequest) {
  const collection = new URL(req.url).searchParams.get("collection");
  const db = getDb();
  const rows = (collection
    ? db.prepare("SELECT * FROM ingested_documents WHERE collection = ? ORDER BY ingested_at DESC LIMIT 500").all(collection)
    : db.prepare("SELECT * FROM ingested_documents ORDER BY ingested_at DESC LIMIT 500").all()
  ) as DocRow[];

  const documents: IngestedDocumentSummary[] = rows.map((r) => ({
    source_doc_id: r.source_doc_id,
    source_filename: r.source_filename,
    file_type: r.file_type as IngestedDocumentSummary["file_type"],
    file_size: r.file_size,
    md5_hash: r.md5_hash,
    chunk_total: r.chunk_total,
    collection: r.collection,
    ingested_at: r.ingested_at,
  }));

  return NextResponse.json({ documents });
}

// DELETE /api/documents — remove metadata from SQLite + chunks from Astra
export async function DELETE(req: NextRequest) {
  const body = await req.json() as {
    source_doc_id: string;
    collection: string;
    token?: string;
    endpoint?: string;
    keyspace?: string;
  };

  const { source_doc_id, collection } = body;
  const db = getDb();

  // Always remove the local metadata record
  db.prepare("DELETE FROM ingested_documents WHERE source_doc_id = ?").run(source_doc_id);

  // If connected to Astra, also delete the stored chunks
  const { token, endpoint, keyspace } = resolveAstraConnection(body, { includeDefaultKeyspace: true });

  if (token && endpoint) {
    try {
      const astraDb = getAstraDb(token, endpoint, keyspace);
      await astraDb.collection(collection).deleteMany({ "metadata.source_doc_id": { $eq: source_doc_id } });
    } catch {
      // Chunks may have already been removed or collection gone — local delete still succeeded
    }
  }

  return NextResponse.json({ ok: true });
}
