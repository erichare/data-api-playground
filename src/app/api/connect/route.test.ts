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

  it("bounds expensive metadata enrichment for large keyspaces", async () => {
    const collectionNames = Array.from({ length: 14 }, (_, index) => `docs_${index + 1}`);
    const estimatedDocumentCountMocks = new Map(
      collectionNames.map((name, index) => [name, vi.fn().mockResolvedValue(index + 1)])
    );
    const findMocks = new Map(
      collectionNames.map((name) => [
        name,
        vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([{ _id: "1", [name]: "value" }]),
        })),
      ])
    );

    getAstraDbMock.mockReturnValue({
      listCollections: vi.fn().mockResolvedValue(
        collectionNames.map((name) => ({
          name,
          definition: { vector: { dimension: 1024 } },
        }))
      ),
      collection: vi.fn((name: string) => ({
        estimatedDocumentCount: estimatedDocumentCountMocks.get(name),
        find: findMocks.get(name),
      })),
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request as never);
    const payload = (await response.json()) as {
      collections: Array<{ name: string; count: number | null }>;
      fields: Record<string, string[]>;
    };

    expect(payload.collections).toHaveLength(14);
    expect(payload.collections[0]).toMatchObject({ name: "docs_1", count: 1 });
    expect(payload.collections[11]).toMatchObject({ name: "docs_12", count: 12 });
    expect(payload.collections[12]).toMatchObject({ name: "docs_13", count: null });
    expect(payload.collections[13]).toMatchObject({ name: "docs_14", count: null });
    expect(payload.fields.docs_1).toEqual(["docs_1"]);
    expect(payload.fields.docs_12).toEqual(["docs_12"]);
    expect(payload.fields.docs_13).toBeUndefined();
    expect(payload.fields.docs_14).toBeUndefined();

    expect(estimatedDocumentCountMocks.get("docs_12")).toHaveBeenCalledOnce();
    expect(estimatedDocumentCountMocks.get("docs_13")).not.toHaveBeenCalled();
    expect(findMocks.get("docs_12")).toHaveBeenCalledOnce();
    expect(findMocks.get("docs_13")).not.toHaveBeenCalled();
  });
});
