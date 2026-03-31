import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth";

describe("/api/auth/status route", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;

    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;
  });

  it("reports auth as disabled when no password is configured", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/auth/status") as never);

    expect(await response.json()).toEqual({
      enabled: false,
      authenticated: true,
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
    });
  });
});
