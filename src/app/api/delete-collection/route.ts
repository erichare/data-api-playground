import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { deleteCollectionInAstra, ValidationError } from "@/lib/collections/service";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { deleteCollectionBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

const collectionDeleteLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/delete-collection");
  const authError = requireApiAuth(req);
  if (authError) return authError;

  const ip = getClientIp(req);
  const limit = collectionDeleteLimiter.check(ip);
  if (limit.limited) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await parseJsonBody(req, deleteCollectionBodySchema);
  if (isErrorResponse(body)) return body;

  try {
    const result = await deleteCollectionInAstra(
      body.backend === "hcd"
        ? body
        : {
            name: body.name,
            token: body.token,
            endpoint: body.endpoint,
            keyspace: body.keyspace,
          }
    );
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
