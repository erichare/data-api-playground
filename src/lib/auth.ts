import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * HMAC-based session authentication for the playground.
 *
 * When `PLAYGROUND_AUTH_PASSWORD` and `PLAYGROUND_AUTH_SECRET` are both set,
 * all API routes require a valid session cookie. Sessions are 12-hour tokens
 * signed with HMAC-SHA256. Public access is allowed by default in local
 * development and tests, but production now fails closed unless
 * `PLAYGROUND_ALLOW_UNAUTHENTICATED=true` is set intentionally.
 */

/** Name of the httpOnly session cookie. */
export const AUTH_COOKIE_NAME = "dap_auth";
/** Sessions expire after 12 hours. */
const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 12;
/** Public-facing explanation when production auth is not configured. */
export const AUTH_MISCONFIGURED_MESSAGE =
  "Authentication is required in production. Set PLAYGROUND_AUTH_PASSWORD and PLAYGROUND_AUTH_SECRET, or explicitly set PLAYGROUND_ALLOW_UNAUTHENTICATED=true to allow public access.";

function getAuthPassword() {
  return process.env.PLAYGROUND_AUTH_PASSWORD?.trim() ?? "";
}

function getAuthSecret(): string {
  const secret = process.env.PLAYGROUND_AUTH_SECRET?.trim() ?? "";
  if (!secret && getAuthPassword()) {
    // Auth secret is required when password auth is enabled.
    // Without a separate secret, session tokens would be derived from
    // the password alone, weakening the security model.
    console.warn(
      "PLAYGROUND_AUTH_SECRET is required when PLAYGROUND_AUTH_PASSWORD is set. " +
        "Auth is disabled until PLAYGROUND_AUTH_SECRET is configured."
    );
  }
  return secret;
}

function getAllowUnauthenticatedOverride() {
  return process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED?.trim().toLowerCase() === "true";
}

/**
 * Constant-time string comparison that does not leak input lengths.
 * Both values are hashed to a fixed 32-byte digest before comparison,
 * eliminating the timing side-channel from early-exit length checks.
 */
function safeEqual(left: string, right: string) {
  const key = Buffer.alloc(32);
  const leftDigest = createHmac("sha256", key).update(left).digest();
  const rightDigest = createHmac("sha256", key).update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function parseCookie(header: string, name: string) {
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== name) continue;
    return decodeURIComponent(trimmed.slice(separatorIndex + 1));
  }
  return "";
}

/** Check whether password authentication is configured and active. */
export function isAuthEnabled() {
  const enabled = getAuthPassword().length > 0 && getAuthSecret().length > 0;
  if (!enabled && !_authWarningEmitted && typeof process !== "undefined") {
    _authWarningEmitted = true;
    const hasPassword = getAuthPassword().length > 0;
    if (!hasPassword && isPublicAccessAllowed()) {
      console.warn(
        "[auth] PLAYGROUND_AUTH_PASSWORD is not set — authentication is DISABLED. " +
          "All API routes are publicly accessible. Set PLAYGROUND_AUTH_PASSWORD and " +
          "PLAYGROUND_AUTH_SECRET to enable authentication."
      );
    } else if (!hasPassword) {
      console.warn(`[auth] ${AUTH_MISCONFIGURED_MESSAGE}`);
    }
  }
  return enabled;
}

/** Public access is opt-in in production, but remains available by default in local dev/test. */
export function isPublicAccessAllowed() {
  if (getAllowUnauthenticatedOverride()) {
    return true;
  }

  return process.env.NODE_ENV !== "production";
}

/** Production safety check for deployments that forgot to configure auth. */
export function isAuthMisconfigured() {
  return !isAuthEnabled() && !isPublicAccessAllowed();
}

let _authWarningEmitted = false;

/** @internal Reset the auth warning flag for testing. */
export function _resetAuthWarning() {
  _authWarningEmitted = false;
}

/**
 * Generate an HMAC-SHA256 signed session token.
 * Token format: `{expiresAt}.{nonce}.{hmac}` where expiresAt is a Unix timestamp.
 * @returns A signed token string, or empty string if auth is disabled.
 */
export function createSessionToken() {
  if (!isAuthEnabled()) return "";
  const expiresAt = Math.floor(Date.now() / 1000) + AUTH_SESSION_TTL_SECONDS;
  const nonce = randomBytes(32).toString("hex");
  const hmac = createHmac("sha256", getAuthSecret())
    .update(`${expiresAt}.${nonce}`)
    .digest("hex");
  return `${expiresAt}.${nonce}.${hmac}`;
}

const HEX_64_RE = /^[0-9a-f]{64}$/;

/**
 * Validate a session token's HMAC signature and expiration.
 * @returns `true` if the token is valid and not expired, or if auth is disabled.
 */
export function verifySessionToken(token: string): boolean {
  if (!isAuthEnabled()) return true;

  // Split using indexOf to tolerate future encoding changes safely.
  const firstDot = token.indexOf(".");
  const lastDot = token.lastIndexOf(".");
  if (firstDot === -1 || firstDot === lastDot) return false;

  const expiresAtRaw = token.slice(0, firstDot);
  const nonce = token.slice(firstDot + 1, lastDot);
  const hmac = token.slice(lastDot + 1);

  if (!expiresAtRaw || !nonce || !hmac) return false;

  // Validate HMAC format before allocating buffers in safeEqual.
  if (!HEX_64_RE.test(hmac)) return false;

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt)) return false;
  if (expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const expected = createHmac("sha256", getAuthSecret())
    .update(`${expiresAt}.${nonce}`)
    .digest("hex");
  return safeEqual(hmac, expected);
}

/** Compare a candidate password against the configured auth password using timing-safe equality. */
export function verifyPassword(candidate: string) {
  if (!isAuthEnabled()) return true;
  return safeEqual(candidate.trim(), getAuthPassword());
}

/** Check whether a raw cookie value contains a valid, non-expired session token. */
export function isAuthenticatedCookieValue(value?: string | null) {
  if (!isAuthEnabled()) return true;
  if (!value) return false;
  return verifySessionToken(value);
}

/** Extract the session cookie from a request and verify it. */
export function isAuthenticatedRequest(req: Pick<Request, "headers">) {
  if (!isAuthEnabled()) return true;
  const cookieHeader = req.headers.get("cookie") ?? "";
  return isAuthenticatedCookieValue(parseCookie(cookieHeader, AUTH_COOKIE_NAME));
}

/**
 * Guard for API route handlers. Returns a 401 response if the request
 * is not authenticated; returns `null` to indicate the request may proceed.
 */
export function requireApiAuth(req: Pick<Request, "headers">) {
  if (isAuthMisconfigured()) {
    return NextResponse.json({ error: AUTH_MISCONFIGURED_MESSAGE }, { status: 503 });
  }
  if (isAuthenticatedRequest(req)) return null;
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

/** Attach a signed session cookie to a response. */
export function setAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: createSessionToken(),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_SESSION_TTL_SECONDS,
  });
  return response;
}

/** Remove the session cookie from a response (sign-out). */
export function clearAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
