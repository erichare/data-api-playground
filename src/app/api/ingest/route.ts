import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { streamCsvIngest } from "@/lib/ingest/service";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { createRequestLogContext, logError } from "@/lib/server/log";
import { ingestBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

const ingestLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/ingest");
  const authError = requireApiAuth(req);
  if (authError) return authError;

  const ip = getClientIp(req);
  const limit = ingestLimiter.check(ip);
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

  const body = await parseJsonBody(req, ingestBodySchema);
  if (isErrorResponse(body)) return body;

  try {
    const stream = streamCsvIngest({
      ...body,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "X-Request-Id": logContext.requestId,
      },
    });
  } catch (err) {
    logError(logContext, "ingest.failed", err);
    return new Response(
      JSON.stringify({ error: "Failed to start ingest" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
