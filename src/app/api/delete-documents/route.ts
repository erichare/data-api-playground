import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
  withRequestLog,
} from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { deleteDocumentsBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

const documentDeleteLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/delete-documents");
  const authError = requireApiAuth(req);
  if (authError) return authError;

  const ip = getClientIp(req);
  const limit = documentDeleteLimiter.check(ip);
  if (limit.limited) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const result = await parseJsonBody(req, deleteDocumentsBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint, keyspace } = resolveAstraConnection(result, { includeDefaultKeyspace: true });
  const { collection: collectionName, ids } = result;

  if (!token || !endpoint) {
    return NextResponse.json({ error: "token and endpoint are required" }, { status: 400 });
  }

  return withRequestLog(async () => {
    try {
      const db = getAstraDb(token, endpoint, keyspace);
      const coll = db.collection(collectionName);

      recordAstraClientCall({
        label: "Delete Documents",
        code: buildTsCall(`db.collection(${JSON.stringify(collectionName)})`, [
          formatTsMethodCall("deleteMany", [{ _id: { $in: ids } }]),
        ]),
      });
      const result = await coll.deleteMany({ _id: { $in: ids } });

      return NextResponse.json({ deletedCount: result.deletedCount });
    } catch (err) {
      logError(logContext, "delete-documents.failed", err, { collection: collectionName });
      return NextResponse.json(
        { error: sanitizeErrorForClient(err, "Failed to delete documents") },
        { status: 500 }
      );
    }
  });
}
