import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { resolveDataApiBackend } from "@/lib/dataApi";
import { getDataApiErrorStatus } from "@/lib/dataApi/errors";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { createRequestLogContext, jsonError, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { dataApiProxyBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

const proxyLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/data-api-proxy");
  const authError = requireApiAuth(req);
  if (authError) return authError;

  const ip = getClientIp(req);
  const limit = proxyLimiter.check(ip);
  if (limit.limited) {
    return jsonError(logContext, 429, "Rate limit exceeded");
  }

  const result = await parseJsonBody(req, dataApiProxyBodySchema);
  if (isErrorResponse(result)) return result;
  const { collection, requestBody } = result;

  if (!collection) {
    return jsonError(logContext, 400, "Missing collection name");
  }

  return withRequestLog(async () => {
    const start = Date.now();

    try {
      const { config, backend } = resolveDataApiBackend(result, {
        includeDefaultKeyspace: true,
      });
      const data = await backend.proxy({
        config,
        collection,
        requestBody,
      });

      const latencyMs = Date.now() - start;
      return NextResponse.json({
        status: 200,
        statusText: "OK",
        latencyMs,
        data,
        requestId: logContext.requestId,
      });
    } catch (err) {
      logError(logContext, "data-api.proxy.failed", err, {
        backend: result.backend,
        collection,
      });
      const message = sanitizeErrorForClient(err, "Request failed");
      return jsonError(logContext, getDataApiErrorStatus(message, 500), message);
    }
  });
}
