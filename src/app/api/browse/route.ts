import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { resolveDataApiBackend } from "@/lib/dataApi";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { browseBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/browse");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, browseBodySchema);
  if (isErrorResponse(result)) return result;
  const { collection, pageState, sort } = result;

  if (!collection) {
    return NextResponse.json({ error: "collection is required" }, { status: 400 });
  }

  return withRequestLog(async () => {
    try {
      const { config, backend } = resolveDataApiBackend(result, {
        includeDefaultKeyspace: true,
      });
      const { documents, nextPageState } = await backend.browse({
        config,
        collection,
        pageState,
        sort,
      });

      return NextResponse.json({
        documents,
        nextPageState,
      });
    } catch (err) {
      logError(logContext, "browse.failed", err, {
        backend: result.backend,
        collection,
      });
      return NextResponse.json(
        { error: sanitizeErrorForClient(err, "Failed to fetch documents") },
        { status: 400 }
      );
    }
  });
}
