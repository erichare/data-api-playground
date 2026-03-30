import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import {
  deleteIngestedDocument,
  listIngestedDocuments,
} from "@/lib/collections/service";
import { createRequestLogContext, jsonError, logError } from "@/lib/server/log";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/documents");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  try {
    const collection = new URL(req.url).searchParams.get("collection") ?? undefined;
    return NextResponse.json(
      { documents: listIngestedDocuments(collection) },
      { headers: { "X-Request-Id": logContext.requestId } }
    );
  } catch (err) {
    logError(logContext, "documents.list.failed", err);
    return jsonError(logContext, 500, "Failed to load documents");
  }
}

export async function DELETE(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/documents");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = (await req.json()) as {
    source_doc_id: string;
    collection: string;
    token?: string;
    endpoint?: string;
    keyspace?: string;
  };

  try {
    const result = await deleteIngestedDocument(body);
    return NextResponse.json(result, {
      headers: { "X-Request-Id": logContext.requestId },
    });
  } catch (err) {
    logError(logContext, "documents.delete.failed", err, {
      source_doc_id: body.source_doc_id,
      collection: body.collection,
    });
    return jsonError(
      logContext,
      500,
      err instanceof Error ? err.message : "Failed to delete document"
    );
  }
}
