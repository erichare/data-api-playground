import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth";

describe("/api/auth/status route", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;
  const originalAllowUnauthenticated = process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
    delete process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED;
  });

  afterEach(() => {
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

  it("reports auth as disabled when no password is configured", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/auth/status") as never);

    expect(await response.json()).toEqual({
      enabled: false,
      authenticated: false,
      publicAccessAllowed: true,
      misconfigured: false,
    });
  });

  it("reports auth as enabled and unauthenticated when the cookie is missing", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/auth/status") as never);

    expect(await response.json()).toEqual({
      enabled: true,
      authenticated: false,
      publicAccessAllowed: true,
      misconfigured: false,
    });
  });

  it("reports authenticated when the signed cookie is present", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/auth/status", {
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(createSessionToken())}`,
        },
      }) as never
    );

    expect(await response.json()).toEqual({
      enabled: true,
      authenticated: true,
      publicAccessAllowed: true,
      misconfigured: false,
    });
  });

  it("reports misconfigured auth when production is not explicitly public", async () => {
    process.env.NODE_ENV = "production";

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/auth/status") as never);

    expect(await response.json()).toEqual({
      enabled: false,
      authenticated: false,
      publicAccessAllowed: false,
      misconfigured: true,
    });
  });
});
