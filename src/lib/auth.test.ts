import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  isAuthenticatedCookieValue,
  isAuthenticatedRequest,
  isAuthEnabled,
  verifyPassword,
  verifySessionToken,
} from "./auth";

const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;

describe("auth helpers", () => {
  afterEach(() => {
    vi.useRealTimers();

    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;

    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;
  });

  it("treats auth as disabled when no password is configured", () => {
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;

    expect(isAuthEnabled()).toBe(false);
    expect(verifyPassword("anything")).toBe(true);
    expect(isAuthenticatedRequest(new Request("http://localhost"))).toBe(true);
  });

  it("treats auth as disabled when password is set but secret is missing", () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    delete process.env.PLAYGROUND_AUTH_SECRET;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isAuthEnabled()).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("PLAYGROUND_AUTH_SECRET is required")
    );
    warnSpy.mockRestore();
  });

  it("validates password and session cookies when auth is enabled", () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const token = createSessionToken();

    expect(isAuthEnabled()).toBe(true);
    expect(verifyPassword("swordfish")).toBe(true);
    expect(verifyPassword("wrong")).toBe(false);
    expect(isAuthenticatedCookieValue(token)).toBe(true);
    expect(
      isAuthenticatedRequest(
        new Request("http://localhost", {
          headers: {
            cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
          },
        })
      )
    ).toBe(true);
    expect(isAuthenticatedCookieValue("bad-token")).toBe(false);
  });

  it("generates unique per-session tokens", () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const token1 = createSessionToken();
    const token2 = createSessionToken();

    expect(token1).not.toBe(token2);
    expect(verifySessionToken(token1)).toBe(true);
    expect(verifySessionToken(token2)).toBe(true);
  });

  it("rejects expired tokens even if the browser still presents them", () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T10:00:00.000Z"));

    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);

    vi.setSystemTime(new Date("2026-04-12T22:00:01.000Z"));
    expect(verifySessionToken(token)).toBe(false);
  });

  it("rejects tampered tokens", () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const token = createSessionToken();
    const [expiresAt, nonce, hmac] = token.split(".");

    // Tamper with the nonce
    const tamperedNonce = "a".repeat(nonce.length);
    expect(verifySessionToken(`${expiresAt}.${tamperedNonce}.${hmac}`)).toBe(false);

    // Tamper with the HMAC
    const tamperedHmac = "b".repeat(hmac.length);
    expect(verifySessionToken(`${expiresAt}.${nonce}.${tamperedHmac}`)).toBe(false);

    // Tamper with the expiry
    expect(verifySessionToken(`0.${nonce}.${hmac}`)).toBe(false);

    // Missing dot separator
    expect(verifySessionToken("nodotshere")).toBe(false);

    // Empty expiry, nonce, or hmac
    expect(verifySessionToken(`.${nonce}.${hmac}`)).toBe(false);
    expect(verifySessionToken(`${expiresAt}..${hmac}`)).toBe(false);
    expect(verifySessionToken(`${expiresAt}.${nonce}.`)).toBe(false);
  });

  it("returns empty token when auth is disabled", () => {
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;

    expect(createSessionToken()).toBe("");
  });
});
