import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAstraDbMock = vi.fn();
const resolveAstraConnectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
  SYSTEM_FIELDS: new Set(["_id", "$vector"]),
}));

describe("/api/connect route", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
    resolveAstraConnectionMock.mockReturnValue({
      token: "AstraCS:secret-token",
      endpoint: "https://db-id-us-east1.apps.astra.datastax.com",
      keyspace: "default_keyspace",
    });
    getAstraDbMock.mockReturnValue({
      listCollections: vi.fn().mockResolvedValue([
        {
          name: "docs",
          definition: { vector: { dimension: 1024 } },
        },
      ]),
      collection: vi.fn(() => ({
        estimatedDocumentCount: vi.fn().mockResolvedValue(12),
        find: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([{ _id: "1", title: "A" }]),
        })),
      })),
    });
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;

    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;
  });

  it("returns 401 when auth is enabled and no session cookie is present", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "letmein";
    process.env.PLAYGROUND_AUTH_SECRET = "connect-secret";

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Authentication required",
    });
    expect(getAstraDbMock).not.toHaveBeenCalled();
  });

  it("returns collection metadata without echoing resolved credentials", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request as never);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toMatchObject({
      collections: [
        {
          name: "docs",
          count: 12,
          vectorDim: 1024,
        },
      ],
      fields: {
        docs: ["title"],
      },
    });
    expect(payload).not.toHaveProperty("token");
    expect(payload).not.toHaveProperty("endpoint");
  });
});
