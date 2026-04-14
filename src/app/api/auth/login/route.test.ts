import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("/api/auth/login route", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;
  const originalAllowUnauthenticated = process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED;
  const originalLoginRateLimit = process.env.PLAYGROUND_AUTH_LOGIN_RATE_LIMIT_MAX;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
    delete process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED;
    delete process.env.PLAYGROUND_AUTH_LOGIN_RATE_LIMIT_MAX;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;

    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;

    if (originalAllowUnauthenticated === undefined) {
      delete process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED;
    } else {
      process.env.PLAYGROUND_ALLOW_UNAUTHENTICATED = originalAllowUnauthenticated;
    }

    if (originalLoginRateLimit === undefined) {
      delete process.env.PLAYGROUND_AUTH_LOGIN_RATE_LIMIT_MAX;
    } else {
      process.env.PLAYGROUND_AUTH_LOGIN_RATE_LIMIT_MAX = originalLoginRateLimit;
    }

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns disabled when playground auth is not configured", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "anything" }),
      }) as never
    );

    expect(await response.json()).toEqual({
      authenticated: true,
      disabled: true,
    });
  });

  it("returns 503 when production auth is not configured", async () => {
    process.env.NODE_ENV = "production";

    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "anything" }),
      }) as never
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining("Authentication is required in production"),
      requestId: expect.any(String),
    });
  });

  it("returns a 401 with request metadata for an invalid password", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrong" }),
      }) as never
    );

    const payload = (await response.json()) as Record<string, string>;

    expect(response.status).toBe(401);
    expect(payload).toMatchObject({
      error: "Invalid password",
      requestId: expect.any(String),
    });
    expect(response.headers.get("X-Request-Id")).toBe(payload.requestId);
  });

  it("sets the auth cookie when the password is valid", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "swordfish" }),
      }) as never
    );

    expect(await response.json()).toEqual({ authenticated: true });
    expect(response.headers.get("set-cookie")).toContain("dap_auth=");
    expect(response.headers.get("X-Request-Id")).toEqual(expect.any(String));
  });

  it("honors a configured login rate limit override", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";
    process.env.PLAYGROUND_AUTH_LOGIN_RATE_LIMIT_MAX = "1";

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    }) as never;

    const firstResponse = await POST(request);
    const secondResponse = await POST(request);

    expect(firstResponse.status).toBe(401);
    expect(secondResponse.status).toBe(429);
  });
});
