import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { createCollectionInAstra, ValidationError } from "@/lib/collections/service";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { createCollectionBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/create-collection");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = await parseJsonBody(req, createCollectionBodySchema);
  if (isErrorResponse(body)) return body;

  try {
    const collection = await createCollectionInAstra(body);
    return NextResponse.json({ collection });
  } catch (err) {
    const status = err instanceof ValidationError ? 400 : 500;
    logError(logContext, "create-collection.failed", err);
    return NextResponse.json(
      { error: sanitizeErrorForClient(err, "Failed to create collection") },
      { status }
    );
  }
}
