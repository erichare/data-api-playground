import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("/api/auth/login route", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;

    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;
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
});
