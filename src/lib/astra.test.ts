import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dataApiClientCtorMock, dbMock } = vi.hoisted(() => ({
  dataApiClientCtorMock: vi.fn(),
  dbMock: vi.fn(),
}));

vi.mock("@datastax/astra-db-ts", () => ({
  DataAPIClient: class MockDataAPIClient {
    db = dbMock;

    constructor(token: string) {
      dataApiClientCtorMock(token);
    }
  },
}));

import {
  DEFAULT_KEYSPACE,
  SYSTEM_FIELDS,
  clearClientCache,
  getAstraDb,
  isAllowedAstraEndpoint,
  normalizeAstraEndpoint,
  resolveAstraConnection,
} from "./astra";

describe("astra helpers", () => {
  const originalToken = process.env.ASTRA_DB_APPLICATION_TOKEN;
  const originalEndpoint = process.env.ASTRA_DB_API_ENDPOINT;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    clearClientCache();
    delete process.env.ASTRA_DB_APPLICATION_TOKEN;
    delete process.env.ASTRA_DB_API_ENDPOINT;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ASTRA_DB_APPLICATION_TOKEN;
    else process.env.ASTRA_DB_APPLICATION_TOKEN = originalToken;

    if (originalEndpoint === undefined) delete process.env.ASTRA_DB_API_ENDPOINT;
    else process.env.ASTRA_DB_API_ENDPOINT = originalEndpoint;

    vi.useRealTimers();
  });

  it("normalizes endpoints and validates Astra host allow-lists", () => {
    expect(normalizeAstraEndpoint("https://db.apps.astra.datastax.com/")).toBe(
      "https://db.apps.astra.datastax.com"
    );

    expect(isAllowedAstraEndpoint("https://db.apps.astra.datastax.com")).toBe(true);
    expect(isAllowedAstraEndpoint("https://db.astra-dev.datastax.com")).toBe(true);
    expect(isAllowedAstraEndpoint("http://db.apps.astra.datastax.com")).toBe(false);
    expect(isAllowedAstraEndpoint("https://example.com")).toBe(false);
    expect(isAllowedAstraEndpoint("not-a-url")).toBe(false);
    expect(SYSTEM_FIELDS.has("_id")).toBe(true);
    expect(SYSTEM_FIELDS.has("$vector")).toBe(true);
  });

  it("resolves explicit credentials and can apply the default keyspace", () => {
    expect(
      resolveAstraConnection(
        {
          token: "AstraCS:direct-token",
          endpoint: "https://db.apps.astra.datastax.com/",
        },
        { includeDefaultKeyspace: true }
      )
    ).toEqual({
      token: "AstraCS:direct-token",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: DEFAULT_KEYSPACE,
    });
  });

  it("falls back to environment credentials when request values are missing", () => {
    process.env.ASTRA_DB_APPLICATION_TOKEN = "AstraCS:env-token";
    process.env.ASTRA_DB_API_ENDPOINT = "https://db.astra.datastax.com/";

    expect(resolveAstraConnection({}, { includeDefaultKeyspace: false })).toEqual({
      token: "AstraCS:env-token",
      endpoint: "https://db.astra.datastax.com",
      keyspace: undefined,
    });
  });

  it("creates an Astra db handle with a normalized endpoint and optional keyspace", () => {
    const dbHandle = { kind: "db-handle" };
    dbMock.mockReturnValueOnce(dbHandle);

    expect(
      getAstraDb(
        "AstraCS:secret-token",
        "https://db.apps.astra.datastax.com/",
        "documents"
      )
    ).toBe(dbHandle);

    expect(dataApiClientCtorMock).toHaveBeenCalledWith("AstraCS:secret-token");
    expect(dbMock).toHaveBeenCalledWith("https://db.apps.astra.datastax.com", {
      keyspace: "documents",
    });
  });

  it("rejects endpoints outside the Astra allow-list", () => {
    expect(() =>
      getAstraDb("AstraCS:secret-token", "https://example.com")
    ).toThrowError("Invalid Astra DB endpoint");
    expect(dataApiClientCtorMock).not.toHaveBeenCalled();
  });

  it("caches DataAPIClient instances per token", () => {
    const dbHandle = { kind: "db-handle" };
    dbMock.mockReturnValue(dbHandle);

    getAstraDb("AstraCS:token-a", "https://db.apps.astra.datastax.com");
    getAstraDb("AstraCS:token-a", "https://db.apps.astra.datastax.com");

    expect(dataApiClientCtorMock).toHaveBeenCalledTimes(1);
    expect(dataApiClientCtorMock).toHaveBeenCalledWith("AstraCS:token-a");
  });

  it("evicts expired cached clients when the cache is full", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    for (let index = 0; index < 50; index += 1) {
      getAstraDb(
        `AstraCS:token-${index}`,
        "https://db.apps.astra.datastax.com"
      );
    }

    expect(dataApiClientCtorMock).toHaveBeenCalledTimes(50);

    vi.setSystemTime(new Date("2026-01-01T00:06:00Z"));

    getAstraDb("AstraCS:token-50", "https://db.apps.astra.datastax.com");
    getAstraDb("AstraCS:token-0", "https://db.apps.astra.datastax.com");

    expect(dataApiClientCtorMock).toHaveBeenCalledTimes(52);
  });

  it("drops the oldest live cached client when the cache stays at capacity", () => {
    for (let index = 0; index < 50; index += 1) {
      getAstraDb(
        `AstraCS:token-${index}`,
        "https://db.apps.astra.datastax.com"
      );
    }

    getAstraDb("AstraCS:token-50", "https://db.apps.astra.datastax.com");
    getAstraDb("AstraCS:token-0", "https://db.apps.astra.datastax.com");

    expect(dataApiClientCtorMock).toHaveBeenCalledTimes(52);
  });

  it("creates separate clients for different tokens", () => {
    const dbHandle = { kind: "db-handle" };
    dbMock.mockReturnValue(dbHandle);

    getAstraDb("AstraCS:token-a", "https://db.apps.astra.datastax.com");
    getAstraDb("AstraCS:token-b", "https://db.apps.astra.datastax.com");

    expect(dataApiClientCtorMock).toHaveBeenCalledTimes(2);
  });

  it("clears the client cache", () => {
    const dbHandle = { kind: "db-handle" };
    dbMock.mockReturnValue(dbHandle);

    getAstraDb("AstraCS:token-a", "https://db.apps.astra.datastax.com");
    clearClientCache();
    getAstraDb("AstraCS:token-a", "https://db.apps.astra.datastax.com");

    expect(dataApiClientCtorMock).toHaveBeenCalledTimes(2);
  });
});
