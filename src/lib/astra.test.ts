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
  getAstraDb,
  isAllowedAstraEndpoint,
  normalizeAstraEndpoint,
  resolveAstraConnection,
} from "./astra";

describe("astra helpers", () => {
  const originalToken = process.env.ASTRA_DB_APPLICATION_TOKEN;
  const originalEndpoint = process.env.ASTRA_DB_API_ENDPOINT;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ASTRA_DB_APPLICATION_TOKEN;
    delete process.env.ASTRA_DB_API_ENDPOINT;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ASTRA_DB_APPLICATION_TOKEN;
    else process.env.ASTRA_DB_APPLICATION_TOKEN = originalToken;

    if (originalEndpoint === undefined) delete process.env.ASTRA_DB_API_ENDPOINT;
    else process.env.ASTRA_DB_API_ENDPOINT = originalEndpoint;
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
});
