import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, setAuthCookie, verifyPassword } from "@/lib/auth";
import { createRequestLogContext, jsonError, logError, logInfo } from "@/lib/server/log";

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/auth/login");
  if (!isAuthEnabled()) {
    return NextResponse.json({ authenticated: true, disabled: true });
  }

  try {
    const body = (await req.json()) as { password?: string };
    if (!verifyPassword(body.password ?? "")) {
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
