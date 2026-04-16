import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { loadIngestedDocumentContent } from "@/lib/collections/service";
import { resolveKnowledgeBackend } from "@/lib/knowledge";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { documentsChunksBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

// POST /api/documents/chunks
export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/documents/chunks");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, documentsChunksBodySchema);
  if (isErrorResponse(result)) return result;
  const { source_doc_id: sourceDocId, collection } = result;
  const { config } = resolveKnowledgeBackend(result, {
    includeDefaultKeyspace: true,
  });
  const isConnected =
    "backend" in config
      ? config.backend === "astra"
        ? Boolean(config.token && config.endpoint)
        : Boolean(config.endpoint && config.username && config.password)
      : Boolean(config.apiKey);
  if (!isConnected) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  return withRequestLog(async () => {
    try {
      const chunks = await loadIngestedDocumentContent(
        "backend" in config
          ? config.backend === "hcd"
            ? {
                source_doc_id: sourceDocId,
                collection,
                backend: "hcd" as const,
                endpoint: config.endpoint,
                username: config.username,
                password: config.password,
                keyspace: config.keyspace,
                knowledgeBackend: result.knowledgeBackend,
                openragApiKey: result.openragApiKey,
                openragBaseUrl: result.openragBaseUrl,
              }
            : {
                source_doc_id: sourceDocId,
                collection,
                token: config.token,
                endpoint: config.endpoint,
                keyspace: config.keyspace,
                knowledgeBackend: result.knowledgeBackend,
                openragApiKey: result.openragApiKey,
                openragBaseUrl: result.openragBaseUrl,
              }
          : {
              source_doc_id: sourceDocId,
              collection,
              backend: result.backend,
              token: result.token,
              endpoint: result.endpoint,
              username: result.username,
              password: result.password,
              keyspace: result.keyspace,
              knowledgeBackend: "openrag" as const,
              openragApiKey: config.fromEnv ? undefined : config.apiKey,
              openragBaseUrl: config.fromEnv ? undefined : config.baseUrl,
            }
      );
      return NextResponse.json({ chunks });
    } catch (err) {
      logError(logContext, "documents.chunks.failed", err, { collection, sourceDocId });
      const error = sanitizeErrorForClient(err, "Failed to load chunks");
      return NextResponse.json(
        { error },
        { status: error === "Missing credentials" ? 401 : 500 }
      );
    }
  });
}
