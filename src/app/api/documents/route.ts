import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import {
  deleteIngestedDocument,
  listIngestedDocuments,
} from "@/lib/collections/service";
import { resolveIngestedDocumentScope } from "@/lib/ingest/scope";
import { createRequestLogContext, jsonError, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { documentsDeleteBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/documents");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  try {
    const searchParams = new URL(req.url).searchParams;
    const collection = searchParams.get("collection") ?? undefined;
    const backend = searchParams.get("backend");
    const knowledgeBackend = searchParams.get("knowledgeBackend");
    const endpoint = searchParams.get("endpoint") ?? undefined;
    const keyspace = searchParams.get("keyspace") ?? undefined;
    const fromAstraCli = searchParams.get("fromAstraCli") === "true";
    const astraCliProfile = searchParams.get("astraCliProfile") ?? undefined;
    const astraCliDatabase = searchParams.get("astraCliDatabase") ?? undefined;
    const openragBaseUrl = searchParams.get("openragBaseUrl") ?? undefined;
    const scope = backend || knowledgeBackend
      ? resolveIngestedDocumentScope({
          ...(backend === "hcd" ? { backend: "hcd" as const } : {}),
          ...(backend === "astra" || (!backend && knowledgeBackend !== "openrag")
            ? { backend: "astra" as const }
            : {}),
          ...(knowledgeBackend === "openrag"
            ? { knowledgeBackend: "openrag" as const }
            : {}),
          ...(endpoint ? { endpoint } : {}),
          ...(keyspace ? { keyspace } : {}),
          ...(fromAstraCli ? { fromAstraCli: true } : {}),
          ...(astraCliProfile ? { astraCliProfile } : {}),
          ...(astraCliDatabase ? { astraCliDatabase } : {}),
          ...(openragBaseUrl ? { openragBaseUrl } : {}),
        })
      : null;
    return NextResponse.json(
      {
        documents: listIngestedDocuments({
          collection,
          backendKind: scope?.backendKind,
          backendScope: scope?.backendScope,
        }),
      },
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
  const body = await parseJsonBody(req, documentsDeleteBodySchema);
  if (isErrorResponse(body)) return body;

  try {
    const request =
      body.backend === "hcd"
        ? {
            source_doc_id: body.source_doc_id,
            collection: body.collection,
            backend: "hcd" as const,
            endpoint: body.endpoint,
            username: body.username,
            password: body.password,
            ...(body.keyspace ? { keyspace: body.keyspace } : {}),
            ...(body.knowledgeBackend
              ? { knowledgeBackend: body.knowledgeBackend }
              : {}),
            ...(body.openragApiKey ? { openragApiKey: body.openragApiKey } : {}),
            ...(body.openragBaseUrl ? { openragBaseUrl: body.openragBaseUrl } : {}),
          }
        : {
            source_doc_id: body.source_doc_id,
            collection: body.collection,
            token: body.token,
            endpoint: body.endpoint,
            ...(body.fromAstraCli ? { fromAstraCli: true } : {}),
            ...(body.astraCliProfile ? { astraCliProfile: body.astraCliProfile } : {}),
            ...(body.astraCliDatabase ? { astraCliDatabase: body.astraCliDatabase } : {}),
            ...(body.keyspace ? { keyspace: body.keyspace } : {}),
            ...(body.knowledgeBackend
              ? { knowledgeBackend: body.knowledgeBackend }
              : {}),
            ...(body.openragApiKey ? { openragApiKey: body.openragApiKey } : {}),
            ...(body.openragBaseUrl ? { openragBaseUrl: body.openragBaseUrl } : {}),
          };
    const result = await deleteIngestedDocument(request);
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
      sanitizeErrorForClient(err, "Failed to delete document")
    );
  }
}
