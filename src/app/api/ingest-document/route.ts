import { requireApiAuth } from "@/lib/auth";
import { parseDocumentUpload, streamDocumentIngest } from "@/lib/ingest/service";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { createRequestLogContext, logError } from "@/lib/server/log";
import { assertRequestBodySize } from "@/lib/validation/parse";

export const runtime = "nodejs";

const ingestDocLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(req: Request) {
  const logContext = createRequestLogContext(req, "/api/ingest-document");
  const authError = requireApiAuth(req);
  if (authError) return authError;

  const ip = getClientIp(req);
  const limit = ingestDocLimiter.check(ip);
  if (limit.limited) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again later.", requestId: logContext.requestId }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          "X-Request-Id": logContext.requestId,
        },
      }
    );
  }

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
