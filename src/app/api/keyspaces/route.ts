import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { resolveDataApiBackend } from "@/lib/dataApi";
import { toLegacyAstraCredentialMessage } from "@/lib/dataApi/errors";
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

  return withRequestLog(async () => {
    try {
      const { config, backend } = resolveDataApiBackend(result);
      const keyspaces = await backend.listKeyspaces(config);
      return NextResponse.json(
        { keyspaces },
        { headers: { "X-Request-Id": logContext.requestId } }
      );
    } catch (err) {
      logError(logContext, "keyspaces.failed", err, { backend: result.backend });
      return jsonError(
        logContext,
        400,
        toLegacyAstraCredentialMessage(
          sanitizeErrorForClient(err, "Failed to list keyspaces")
        )
      );
    }
  });
}
