import { NextRequest, NextResponse } from "next/server";
import { resolveAstraConnection } from "@/lib/astra";
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
  const { token, endpoint, keyspace } = resolveAstraConnection(result);

  if (!token || !endpoint) {
    return jsonError(logContext, 400, "token and endpoint are required");
  }

  return withRequestLog(async () => {
    try {
      const { collections, fields } = await fetchCollectionMetadata({
        token,
        endpoint,
        keyspace,
      });

      return NextResponse.json(
        { collections, fields },
        { headers: { "X-Request-Id": logContext.requestId } }
      );
    } catch (err) {
      logError(logContext, "astra.connect.failed", err);
      return jsonError(logContext, 400, sanitizeErrorForClient(err, "Failed to connect"));
    }
  });
}
