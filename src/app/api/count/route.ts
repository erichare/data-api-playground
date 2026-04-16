import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { resolveDataApiBackend } from "@/lib/dataApi";
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
  const { collection } = result;

  if (!collection) {
    return NextResponse.json({ error: "collection is required" }, { status: 400 });
  }

  return withRequestLog(async () => {
    try {
      const { config, backend } = resolveDataApiBackend(result, {
        includeDefaultKeyspace: true,
      });
      const count = await backend.count(config, collection);
      return NextResponse.json({ count });
    } catch (err) {
      logError(logContext, "count.failed", err, {
        backend: result.backend,
        collection,
      });
      return NextResponse.json(
        { error: sanitizeErrorForClient(err, "Failed to count documents") },
        { status: 500 }
      );
    }
  });
}
