import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection, SYSTEM_FIELDS } from "@/lib/astra";
import { requireApiAuth } from "@/lib/auth";
import { createRequestLogContext, jsonError, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { sampleFieldsBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

/**
 * Sample field names from one document in a single Astra DB collection.
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
  const { token, endpoint, keyspace } = resolveAstraConnection(result, {
    includeDefaultKeyspace: true,
  });

  if (!token || !endpoint) {
    return jsonError(logContext, 400, "token and endpoint are required");
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);
    const collectionRef = db.collection(collection);
    const sample = await collectionRef.find({}, { limit: 1 }).toArray();

    const fields: string[] = [];
    for (const doc of sample) {
      for (const key of Object.keys(doc)) {
        if (!SYSTEM_FIELDS.has(key)) fields.push(key);
      }
    }

    return NextResponse.json(
      { collection, fields },
      { headers: { "X-Request-Id": logContext.requestId } }
    );
  } catch (err) {
    logError(logContext, "sampleFields.failed", err);
    return jsonError(logContext, 500, sanitizeErrorForClient(err, "Failed to sample fields"));
  }
}
