import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const AUTH_COOKIE_NAME = "dap_auth";
const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 12;

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

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
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

export function isAuthEnabled() {
  const enabled = getAuthPassword().length > 0 && getAuthSecret().length > 0;
  if (!enabled && !_authWarningEmitted && typeof process !== "undefined") {
    _authWarningEmitted = true;
    const hasPassword = getAuthPassword().length > 0;
    if (!hasPassword) {
      console.warn(
        "[auth] PLAYGROUND_AUTH_PASSWORD is not set — authentication is DISABLED. " +
          "All API routes are publicly accessible. Set PLAYGROUND_AUTH_PASSWORD and " +
          "PLAYGROUND_AUTH_SECRET to enable authentication."
      );
    }
  }
  return enabled;
}

let _authWarningEmitted = false;

/** @internal Reset the auth warning flag for testing. */
export function _resetAuthWarning() {
  _authWarningEmitted = false;
}

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

export function verifyPassword(candidate: string) {
  if (!isAuthEnabled()) return true;
  return safeEqual(candidate.trim(), getAuthPassword());
}

export function isAuthenticatedCookieValue(value?: string | null) {
  if (!isAuthEnabled()) return true;
  if (!value) return false;
  return verifySessionToken(value);
}

export function isAuthenticatedRequest(req: Pick<Request, "headers">) {
  if (!isAuthEnabled()) return true;
  const cookieHeader = req.headers.get("cookie") ?? "";
  return isAuthenticatedCookieValue(parseCookie(cookieHeader, AUTH_COOKIE_NAME));
}

export function requireApiAuth(req: Pick<Request, "headers">) {
  if (isAuthenticatedRequest(req)) return null;
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

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
