import { NextRequest, NextResponse } from "next/server";
import {
  deleteIngestedDocument,
  listIngestedDocuments,
} from "@/lib/collections/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const collection = new URL(req.url).searchParams.get("collection") ?? undefined;
  return NextResponse.json({ documents: listIngestedDocuments(collection) });
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json()) as {
    source_doc_id: string;
    collection: string;
    token?: string;
    endpoint?: string;
    keyspace?: string;
  };

  const result = await deleteIngestedDocument(body);
  return NextResponse.json(result);
}
