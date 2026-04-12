import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  getRedirectUrl,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { AUTH_COOKIE_NAME, createSessionToken, _resetAuthWarning } from "@/lib/auth";
import { config, proxy } from "./proxy";

describe("proxy", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;

  beforeEach(() => {
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
    _resetAuthWarning();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;

    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;

    _resetAuthWarning();
    vi.restoreAllMocks();
  });

  it("matches application routes but skips excluded assets", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "/collections",
      })
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "/_next/static/chunks/app.js",
      })
    ).toBe(false);
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "/favicon.ico",
      })
    ).toBe(false);
  });

  it("lets all traffic through when auth is disabled", () => {
    const response = proxy(new NextRequest("http://localhost/collections"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(getRedirectUrl(response)).toBeNull();
  });

  it("allows auth routes without a session cookie", () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const response = proxy(new NextRequest("http://localhost/api/auth/login"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(getRedirectUrl(response)).toBeNull();
  });

  it("redirects authenticated users away from the login page", () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const token = createSessionToken();
    const response = proxy(
      new NextRequest("http://localhost/login", {
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
        },
      })
    );

    expect(getRedirectUrl(response)).toBe("http://localhost/");
  });

  it("returns a 401 JSON response for unauthenticated API requests", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const response = proxy(new NextRequest("http://localhost/api/connect"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required",
    });
  });

  it("redirects unauthenticated page requests to login and preserves the next path", () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const response = proxy(
      new NextRequest("http://localhost/collections/orders?tab=ingest")
    );

    expect(getRedirectUrl(response)).toBe(
      "http://localhost/login?next=%2Fcollections%2Forders%3Ftab%3Dingest"
    );
  });

  it("returns 413 when content-length exceeds the default limit for API routes", async () => {
    const response = proxy(
      new NextRequest("http://localhost/api/connect", {
        method: "POST",
        headers: {
          "content-length": String(11 * 1024 * 1024),
          "content-type": "application/json",
        },
      })
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Payload too large",
    });
  });

  it("allows larger payloads for ingest routes", () => {
    const response = proxy(
      new NextRequest("http://localhost/api/ingest", {
        method: "POST",
        headers: {
          "content-length": String(40 * 1024 * 1024),
          "content-type": "application/json",
        },
      })
    );

    // Should pass through (not 413) — 40 MB is under 50 MB ingest limit
    expect(response.status).not.toBe(413);
  });

  it("rejects oversized payloads even for ingest routes", async () => {
    const response = proxy(
      new NextRequest("http://localhost/api/ingest-document", {
        method: "POST",
        headers: {
          "content-length": String(51 * 1024 * 1024),
          "content-type": "multipart/form-data; boundary=test",
        },
      })
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Payload too large",
    });
  });

  it("does not enforce body size limits on non-API routes", () => {
    const response = proxy(
      new NextRequest("http://localhost/collections", {
        headers: { "content-length": String(100 * 1024 * 1024) },
      })
    );

    expect(response.status).not.toBe(413);
  });

  it("requires content-length for API requests that declare a request body", async () => {
    const response = proxy(
      new NextRequest("http://localhost/api/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(411);
    await expect(response.json()).resolves.toEqual({
      error: "Content-Length header is required for API requests with a body",
    });
  });
});
