import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { deleteCollectionInAstra, ValidationError } from "@/lib/collections/service";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { deleteCollectionBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const logContext = createRequestLogContext(req, "/api/delete-collection");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = await parseJsonBody(req, deleteCollectionBodySchema);
  if (isErrorResponse(body)) return body;

  try {
    const result = await deleteCollectionInAstra(body);
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof ValidationError ? 400 : 500;
    logError(logContext, "delete-collection.failed", err);
    return NextResponse.json(
      { error: sanitizeErrorForClient(err, "Failed to delete collection") },
      { status }
    );
  }
}
