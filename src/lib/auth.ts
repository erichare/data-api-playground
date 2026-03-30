import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const AUTH_COOKIE_NAME = "dap_auth";
const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 12;

function getAuthPassword() {
  return process.env.PLAYGROUND_AUTH_PASSWORD?.trim() ?? "";
}

function getAuthSecret() {
  return process.env.PLAYGROUND_AUTH_SECRET?.trim() || getAuthPassword();
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
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
  return getAuthPassword().length > 0;
}

export function createSessionToken() {
  if (!isAuthEnabled()) return "";
  return hashValue(`${getAuthSecret()}:${getAuthPassword()}`);
}

export function verifyPassword(candidate: string) {
  if (!isAuthEnabled()) return true;
  return safeEqual(candidate.trim(), getAuthPassword());
}

export function isAuthenticatedCookieValue(value?: string | null) {
  if (!isAuthEnabled()) return true;
  if (!value) return false;
  return safeEqual(value, createSessionToken());
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
    sameSite: "lax",
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
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
