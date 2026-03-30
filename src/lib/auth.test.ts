import { afterEach, describe, expect, it } from "vitest";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  isAuthenticatedCookieValue,
  isAuthenticatedRequest,
  isAuthEnabled,
  verifyPassword,
} from "./auth";

const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;

describe("auth helpers", () => {
  afterEach(() => {
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
});
