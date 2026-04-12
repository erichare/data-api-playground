import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
  withRequestLog,
} from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { createRequestLogContext, jsonError, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { keyspacesBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/keyspaces");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, keyspacesBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint } = resolveAstraConnection(result);

  if (!token || !endpoint) {
    return jsonError(logContext, 400, "token and endpoint are required");
  }

  return withRequestLog(async () => {
    try {
      const admin = getAstraDb(token, endpoint).admin();
      recordAstraClientCall({
        label: "List Keyspaces",
        code: buildTsCall("db.admin()", [
          formatTsMethodCall("listKeyspaces", []),
        ]),
      });
      const keyspaces = await admin.listKeyspaces();
      return NextResponse.json(
        { keyspaces },
        { headers: { "X-Request-Id": logContext.requestId } }
      );
    } catch (err) {
      logError(logContext, "keyspaces.failed", err);
      return jsonError(
        logContext,
        400,
        sanitizeErrorForClient(err, "Failed to list keyspaces")
      );
    }
  });
}
