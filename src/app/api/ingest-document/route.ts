import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { parseDocumentUpload, streamDocumentIngest } from "@/lib/ingest/service";
import { createRequestLogContext, logError } from "@/lib/server/log";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/ingest-document");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  try {
    const parsed = await parseDocumentUpload(await req.formData());
    const stream = streamDocumentIngest({
      ...parsed,
      hfKey: process.env.HUGGINGFACE_API_KEY,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "X-Request-Id": logContext.requestId,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No file provided";
    logError(logContext, "ingest.document.failed", err);
    return new Response(
      JSON.stringify({ error: message, requestId: logContext.requestId }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": logContext.requestId,
        },
      }
    );
  }
}
