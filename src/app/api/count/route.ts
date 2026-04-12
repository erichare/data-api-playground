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
import { countBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/count");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, countBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint, keyspace } = resolveAstraConnection(result, { includeDefaultKeyspace: true });
  const { collection } = result;

  if (!token || !endpoint || !collection) {
    return NextResponse.json({ error: "token, endpoint, and collection are required" }, { status: 400 });
  }

  return withRequestLog(async () => {
    try {
      const db = getAstraDb(token, endpoint, keyspace);
      recordAstraClientCall({
        label: "Count Documents",
        code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
          formatTsMethodCall("estimatedDocumentCount", []),
        ]),
      });
      const count = await db.collection(collection).estimatedDocumentCount();
      return NextResponse.json({ count });
    } catch (err) {
      logError(logContext, "count.failed", err, { collection });
      return NextResponse.json(
        { error: sanitizeErrorForClient(err, "Failed to count documents") },
        { status: 500 }
      );
    }
  });
}
