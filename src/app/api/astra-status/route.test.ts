import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth";

describe("/api/astra-status route", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;
  const originalToken = process.env.ASTRA_DB_APPLICATION_TOKEN;
  const originalEndpoint = process.env.ASTRA_DB_API_ENDPOINT;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
    delete process.env.ASTRA_DB_APPLICATION_TOKEN;
    delete process.env.ASTRA_DB_API_ENDPOINT;
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;

    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;

    if (originalToken === undefined) delete process.env.ASTRA_DB_APPLICATION_TOKEN;
    else process.env.ASTRA_DB_APPLICATION_TOKEN = originalToken;

    if (originalEndpoint === undefined) delete process.env.ASTRA_DB_API_ENDPOINT;
    else process.env.ASTRA_DB_API_ENDPOINT = originalEndpoint;
  });

  it("returns 401 when auth is enabled and no session cookie is present", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/astra-status"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Authentication required",
    });
  });

  it("returns the Astra env availability flags for authenticated requests", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";
    process.env.ASTRA_DB_APPLICATION_TOKEN = "AstraCS:secret";
    process.env.ASTRA_DB_API_ENDPOINT = "https://example.apps.astra.datastax.com";

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/astra-status", {
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(createSessionToken())}`,
        },
      })
    );

    expect(await response.json()).toEqual({
      hasToken: true,
      hasEndpoint: true,
    });
  });
});
