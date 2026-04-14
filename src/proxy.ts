import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_MISCONFIGURED_MESSAGE,
  isAuthEnabled,
  isAuthenticatedRequest,
  isAuthMisconfigured,
} from "@/lib/auth";
import {
  DEFAULT_API_BODY_LIMIT_BYTES,
  INGEST_API_BODY_LIMIT_BYTES,
} from "@/lib/server/requestLimits";

/**
 * Next.js middleware that enforces body size limits and authentication.
 *
 * Runs before route handlers to:
 * 1. Reject API requests with bodies exceeding the limit (10 MB general, 50 MB ingest).
 * 2. Fail closed in production if auth is not configured explicitly.
 * 3. Require a valid session cookie when `PLAYGROUND_AUTH_PASSWORD` is configured.
 * 4. Redirect unauthenticated users to `/login` for page requests.
 * 5. Allow `/api/auth/*` and `/login` routes to bypass auth checks.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const mayHaveBody =
    pathname.startsWith("/api/") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    (req.headers.has("content-length") ||
      req.headers.has("content-type") ||
      req.headers.has("transfer-encoding"));

  // Enforce header-based body checks before route handlers parse the request.
  const contentLength = req.headers.get("content-length");
  if (mayHaveBody && !contentLength) {
    return NextResponse.json(
      { error: "Content-Length header is required for API requests with a body" },
      { status: 411 }
    );
  }

  if (contentLength && pathname.startsWith("/api/")) {
    const size = parseInt(contentLength, 10);
    const limit = pathname.startsWith("/api/ingest")
      ? INGEST_API_BODY_LIMIT_BYTES
      : DEFAULT_API_BODY_LIMIT_BYTES;
    if (!isNaN(size) && size > limit) {
      return NextResponse.json(
        { error: "Payload too large" },
        { status: 413 }
      );
    }
  }

  if (isAuthMisconfigured()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: AUTH_MISCONFIGURED_MESSAGE },
        { status: 503 }
      );
    }

    return new NextResponse(AUTH_MISCONFIGURED_MESSAGE, {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  if (!isAuthEnabled()) {
    return NextResponse.next();
  }
  const isAuthenticated = isAuthenticatedRequest(req);

  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (isAuthenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
