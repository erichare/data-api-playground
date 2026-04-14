import { afterEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  isAuthenticatedCookieValue,
  isAuthenticatedRequest,
  isAuthEnabled,
  isAuthMisconfigured,
  isPublicAccessAllowed,
  requireApiAuth,
  verifyPassword,
  verifySessionToken,
} from "./auth";

const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;
const originalAllowUnauthenticated = process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED;
const originalNodeEnv = process.env.NODE_ENV;

describe("auth helpers", () => {
  afterEach(() => {
    vi.useRealTimers();

    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;

    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;

    if (originalAllowUnauthenticated === undefined) {
      delete process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED;
    } else {
      process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED = originalAllowUnauthenticated;
    }

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("treats auth as disabled when no password is configured", () => {
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;

    expect(isAuthEnabled()).toBe(false);
    expect(verifyPassword("anything")).toBe(true);
    expect(isAuthenticatedRequest(new Request("http://localhost"))).toBe(true);
  });

  it("fails closed in production unless public access is explicitly allowed", () => {
    process.env.NODE_ENV = "production";
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
    delete process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED;

    expect(isAuthEnabled()).toBe(false);
    expect(isPublicAccessAllowed()).toBe(false);
    expect(isAuthMisconfigured()).toBe(true);
    expect(requireApiAuth(new Request("http://localhost"))?.status).toBe(503);
  });

  it("allows an explicit unauthenticated production override", () => {
    process.env.NODE_ENV = "production";
    process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED = "true";
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;

    expect(isAuthEnabled()).toBe(false);
    expect(isPublicAccessAllowed()).toBe(true);
    expect(isAuthMisconfigured()).toBe(false);
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

  describe("bcrypt password verification", () => {
    it("accepts a correct password when configured with a bcrypt hash", () => {
      const plaintext = "super-secret-pw";
      const hash = bcrypt.hashSync(plaintext, 10);
      process.env.PLAYGROUND_AUTH_PASSWORD = hash;
      process.env.PLAYGROUND_AUTH_SECRET = "test-secret";

      expect(verifyPassword(plaintext)).toBe(true);
    });

    it("rejects a wrong password when configured with a bcrypt hash", () => {
      const hash = bcrypt.hashSync("correct-password", 10);
      process.env.PLAYGROUND_AUTH_PASSWORD = hash;
      process.env.PLAYGROUND_AUTH_SECRET = "test-secret";

      expect(verifyPassword("wrong-password")).toBe(false);
    });

    it("falls back to plaintext comparison when password is not a bcrypt hash", () => {
      process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
      process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

      expect(verifyPassword("swordfish")).toBe(true);
      expect(verifyPassword("wrong")).toBe(false);
    });

    it("trims whitespace from candidate before bcrypt comparison", () => {
      const plaintext = "trimmed";
      const hash = bcrypt.hashSync(plaintext, 10);
      process.env.PLAYGROUND_AUTH_PASSWORD = hash;
      process.env.PLAYGROUND_AUTH_SECRET = "test-secret";

      expect(verifyPassword("  trimmed  ")).toBe(true);
    });
  });
});
