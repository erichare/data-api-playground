import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { fetchCollectionMetadata } from "@/lib/collections/service";
import { createRequestLogContext, jsonError, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { connectBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/connect");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, connectBodySchema);
  if (isErrorResponse(result)) return result;

  return withRequestLog(async () => {
    try {
      const { collections, fields, keyspaces, resolvedKeyspace, capabilities } =
        await fetchCollectionMetadata(result);

      return NextResponse.json(
        { collections, fields, keyspaces, resolvedKeyspace, capabilities },
        { headers: { "X-Request-Id": logContext.requestId } }
      );
    } catch (err) {
      logError(logContext, "backend.connect.failed", err, { backend: result.backend });
      return jsonError(logContext, 400, sanitizeErrorForClient(err, "Failed to connect"));
    }
  });
}
