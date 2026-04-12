import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
  withRequestLog,
} from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
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
    return NextResponse.json({ error: "token and endpoint are required" }, { status: 400 });
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
      return NextResponse.json({ keyspaces });
    } catch (err) {
      logError(logContext, "keyspaces.failed", err);
      return NextResponse.json(
        { error: sanitizeErrorForClient(err, "Failed to list keyspaces") },
        { status: 400 }
      );
    }
  });
}
