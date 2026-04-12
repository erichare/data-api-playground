import { requireApiAuth } from "@/lib/auth";
import { parseDocumentUpload, streamDocumentIngest } from "@/lib/ingest/service";
import { createRequestLogContext, logError } from "@/lib/server/log";
import { assertRequestBodySize } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const logContext = createRequestLogContext(req, "/api/ingest-document");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const bodySizeError = await assertRequestBodySize(req, { clone: true });
  if (bodySizeError) return bodySizeError;
  try {
    const parsed = await parseDocumentUpload(await req.formData());
    const stream = streamDocumentIngest(parsed);

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
