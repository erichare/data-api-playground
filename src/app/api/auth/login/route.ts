import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, setAuthCookie, verifyPassword } from "@/lib/auth";
import { createRequestLogContext, jsonError, logError, logInfo } from "@/lib/server/log";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { loginBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/auth/login");
  if (!isAuthEnabled()) {
    return NextResponse.json({ authenticated: true, disabled: true });
  }

  const ip = getClientIp(req);
  const limit = loginLimiter.check(ip);
  if (limit.limited) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          "X-Request-Id": logContext.requestId,
        },
      }
    );
  }

  try {
    const result = await parseJsonBody(req, loginBodySchema);
    if (isErrorResponse(result)) return result;

    if (!verifyPassword(result.password)) {
      logInfo(logContext, "auth.login.failed");
      return jsonError(logContext, 401, "Invalid password");
    }

    logInfo(logContext, "auth.login.succeeded");
    const response = setAuthCookie(NextResponse.json({ authenticated: true }));
    response.headers.set("X-Request-Id", logContext.requestId);
    return response;
  } catch (err) {
    logError(logContext, "auth.login.error", err);
    return jsonError(logContext, 400, "Login failed");
  }
}
