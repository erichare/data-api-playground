import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection, SYSTEM_FIELDS } from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { createRequestLogContext, jsonError, logError } from "@/lib/server/log";
import { connectBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/connect");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, connectBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint, keyspace } = resolveAstraConnection(result);

  if (!token || !endpoint) {
    return jsonError(logContext, 400, "token and endpoint are required");
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);

    recordAstraClientCall({
      label: "Connect to Astra",
      code: buildTsCall("db", [
        formatTsMethodCall("listCollections", [{ nameOnly: false }]),
      ]),
    });
    const colls = await db.listCollections({ nameOnly: false });

    const collections = await Promise.all(
      colls.map(async (c) => {
        let count = 0;
        try {
          recordAstraClientCall({
            label: "Collection Estimated Count",
            code: buildTsCall(`db.collection(${JSON.stringify(c.name)})`, [
              formatTsMethodCall("estimatedDocumentCount", []),
            ]),
          });
          count = await db.collection(c.name).estimatedDocumentCount();
        } catch { /* leave count at 0 if unsupported */ }
        const vectorDef = c.definition?.vector;
        const svc = vectorDef?.service;
        return {
          name: c.name,
          vectorDim: vectorDef?.dimension ?? null,
          vectorizeService: svc ? { provider: svc.provider, modelName: svc.modelName } : null,
          count,
        };
      })
    );

    // Sample field names from each collection in the background
    const fields: Record<string, string[]> = {};
    await Promise.all(
      collections.map(async (c) => {
        try {
          recordAstraClientCall({
            label: "Sample Collection Fields",
            code: buildTsCall(`db.collection(${JSON.stringify(c.name)})`, [
              formatTsMethodCall("find", [{}, { limit: 3 }]),
              ".toArray()",
            ]),
          });
          const sample = await db.collection(c.name).find({}, { limit: 3 }).toArray();
          const fieldSet = new Set<string>();
          for (const doc of sample) {
            for (const key of Object.keys(doc)) {
              if (!SYSTEM_FIELDS.has(key)) fieldSet.add(key);
            }
          }
          if (fieldSet.size > 0) fields[c.name] = Array.from(fieldSet);
        } catch { /* best-effort */ }
      })
    );

    return NextResponse.json(
      { collections, fields },
      { headers: { "X-Request-Id": logContext.requestId } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect";
    logError(logContext, "astra.connect.failed", err);
    return jsonError(logContext, 400, message);
  }
}
