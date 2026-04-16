import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { resolveDataApiBackend } from "@/lib/dataApi";
import { getDataApiErrorStatus } from "@/lib/dataApi/errors";
import { createRequestLogContext, jsonError, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { sampleFieldsBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

/**
 * Sample field names from one document in a single Data API collection.
 *
 * This lightweight endpoint is called after document ingestion so the
 * client can update its field metadata without re-fetching all collections.
 */
export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/sample-fields");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, sampleFieldsBodySchema);
  if (isErrorResponse(result)) return result;
  const { collection } = result;

  try {
    const { config, backend } = resolveDataApiBackend(result, {
      includeDefaultKeyspace: true,
    });
    const fields = await backend.sampleFields(config, collection);

    return NextResponse.json(
      { collection, fields },
      { headers: { "X-Request-Id": logContext.requestId } }
    );
  } catch (err) {
    logError(logContext, "sampleFields.failed", err, { backend: result.backend });
    const message = sanitizeErrorForClient(err, "Failed to sample fields");
    return jsonError(logContext, getDataApiErrorStatus(message, 500), message);
  }
}
