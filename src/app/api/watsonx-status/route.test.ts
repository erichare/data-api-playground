import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth";

describe("/api/watsonx-status route", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;
  const originalApiKey = process.env.WATSONX_API_KEY;
  const originalProjectId = process.env.WATSONX_PROJECT_ID;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
    delete process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_PROJECT_ID;
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;

    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;

    if (originalApiKey === undefined) delete process.env.WATSONX_API_KEY;
    else process.env.WATSONX_API_KEY = originalApiKey;

    if (originalProjectId === undefined) delete process.env.WATSONX_PROJECT_ID;
    else process.env.WATSONX_PROJECT_ID = originalProjectId;
  });

  it("returns 401 when auth is enabled and no session cookie is present", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/watsonx-status"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Authentication required",
    });
  });

  it("returns the watsonx env availability flags for authenticated requests", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "swordfish";
    process.env.PLAYGROUND_AUTH_SECRET = "top-secret";
    process.env.WATSONX_API_KEY = "watsonx-key";
    process.env.WATSONX_PROJECT_ID = "project-1";

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/watsonx-status", {
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(createSessionToken())}`,
        },
      })
    );

    expect(await response.json()).toEqual({
      hasKey: true,
      hasProjectId: true,
    });
  });
});
