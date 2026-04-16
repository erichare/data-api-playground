import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { resolveDataApiBackend } from "@/lib/dataApi";
import { getDataApiErrorStatus, toLegacyAstraCredentialMessage } from "@/lib/dataApi/errors";
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
  const { collection: collectionName, ids } = result;

  return withRequestLog(async () => {
    try {
      const { config, backend } = resolveDataApiBackend(result, {
        includeDefaultKeyspace: true,
      });
      const deleteResult = await backend.deleteDocuments({
        config,
        collection: collectionName,
        ids,
      });

      return NextResponse.json({ deletedCount: deleteResult.deletedCount });
    } catch (err) {
      logError(logContext, "delete-documents.failed", err, {
        backend: result.backend,
        collection: collectionName,
      });
      const rawMessage = sanitizeErrorForClient(err, "Failed to delete documents");
      const message = toLegacyAstraCredentialMessage(rawMessage);
      return NextResponse.json(
        { error: message },
        { status: getDataApiErrorStatus(rawMessage, 500) }
      );
    }
  });
}
