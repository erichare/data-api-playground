import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAstraDbMock = vi.fn();
const resolveAstraConnectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
  SYSTEM_FIELDS: new Set(["_id", "$vector", "$vectorize", "$similarity"]),
}));

describe("/api/sample-fields route", () => {
  const originalPassword = process.env.PLAYGROUND_AUTH_PASSWORD;
  const originalSecret = process.env.PLAYGROUND_AUTH_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
    delete process.env.PLAYGROUND_AUTH_SECRET;
    resolveAstraConnectionMock.mockReturnValue({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
    });
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.PLAYGROUND_AUTH_PASSWORD;
    else process.env.PLAYGROUND_AUTH_PASSWORD = originalPassword;
    if (originalSecret === undefined) delete process.env.PLAYGROUND_AUTH_SECRET;
    else process.env.PLAYGROUND_AUTH_SECRET = originalSecret;
  });

  it("returns sampled field names excluding system fields", async () => {
    getAstraDbMock.mockReturnValue({
      collection: vi.fn(() => ({
        find: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([
            { _id: "1", $vector: [0.1], name: "Alice", age: 30, city: "Portland" },
          ]),
        })),
      })),
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/sample-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "users" }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      collection: "users",
      fields: ["name", "age", "city"],
    });
  });

  it("returns empty fields when the collection has no documents", async () => {
    getAstraDbMock.mockReturnValue({
      collection: vi.fn(() => ({
        find: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/sample-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "empty_col" }),
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ collection: "empty_col", fields: [] });
  });

  it("returns 401 when auth is enabled and no session cookie is present", async () => {
    process.env.PLAYGROUND_AUTH_PASSWORD = "letmein";
    process.env.PLAYGROUND_AUTH_SECRET = "test-secret";

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/sample-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "users" }),
    });

    const response = await POST(request as never);
    expect(response.status).toBe(401);
  });

  it("returns 400 when credentials are missing", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "",
      endpoint: "",
      keyspace: "default_keyspace",
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/sample-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "users" }),
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it("returns 500 when the Astra query fails", async () => {
    getAstraDbMock.mockReturnValue({
      collection: vi.fn(() => ({
        find: vi.fn(() => ({
          toArray: vi.fn().mockRejectedValue(new Error("connection refused")),
        })),
      })),
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/sample-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "users" }),
    });

    const response = await POST(request as never);
    expect(response.status).toBe(500);
  });
});
