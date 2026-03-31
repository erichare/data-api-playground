import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthEnabled, isAuthenticatedRequest } from "@/lib/auth";

const DEFAULT_BODY_LIMIT = 10 * 1024 * 1024; // 10 MB
const INGEST_BODY_LIMIT = 50 * 1024 * 1024; // 50 MB

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Enforce body size limits on all API routes
  const contentLength = req.headers.get("content-length");
  if (contentLength && pathname.startsWith("/api/")) {
    const size = parseInt(contentLength, 10);
    const limit = pathname.startsWith("/api/ingest")
      ? INGEST_BODY_LIMIT
      : DEFAULT_BODY_LIMIT;
    if (!isNaN(size) && size > limit) {
      return NextResponse.json(
        { error: "Payload too large" },
        { status: 413 }
      );
    }
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
