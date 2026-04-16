import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  dataApiClientMock,
  usernamePasswordTokenProviderMock,
  dbMethodMock,
} = vi.hoisted(() => ({
  dataApiClientMock: vi.fn(),
  usernamePasswordTokenProviderMock: vi.fn(),
  dbMethodMock: vi.fn(),
}));

vi.mock("@datastax/astra-db-ts", () => ({
  DataAPIClient: dataApiClientMock,
  UsernamePasswordTokenProvider: usernamePasswordTokenProviderMock,
}));

import {
  clearHcdClientCache,
  getHcdDb,
  isAllowedHcdEndpoint,
  normalizeHcdEndpoint,
  resolveHcdConnection,
} from "@/lib/hcd";

const originalEnv = { ...process.env };

describe("HCD helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearHcdClientCache();
    process.env = { ...originalEnv };
    delete process.env.HCD_DATA_API_ENDPOINT;
    delete process.env.HCD_USERNAME;
    delete process.env.HCD_PASSWORD;
    delete process.env.HCD_KEYSPACE;

    dbMethodMock.mockImplementation((endpoint: string, options?: { keyspace?: string }) => ({
      endpoint,
      options,
    }));
    dataApiClientMock.mockImplementation(function DataAPIClient() {
      return {
        db: dbMethodMock,
      };
    });
    usernamePasswordTokenProviderMock.mockImplementation(
      function UsernamePasswordTokenProvider(username: string, password: string) {
        return { username, password };
      }
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("normalizes and validates HCD endpoints", () => {
    expect(normalizeHcdEndpoint("https://hcd.example.com:8181/")).toBe(
      "https://hcd.example.com:8181"
    );
    expect(isAllowedHcdEndpoint("https://hcd.example.com:8181")).toBe(true);
    expect(isAllowedHcdEndpoint("http://localhost:8181")).toBe(true);
    expect(isAllowedHcdEndpoint("http://127.0.0.1:8181")).toBe(true);
    expect(isAllowedHcdEndpoint("http://remote.example.com:8181")).toBe(false);
  });

  it("resolves manual and environment-backed HCD connection fields", () => {
    process.env.HCD_DATA_API_ENDPOINT = "https://env-hcd.example.com:8181/";
    process.env.HCD_USERNAME = "env-user";
    process.env.HCD_PASSWORD = "env-pass";
    process.env.HCD_KEYSPACE = "env_keyspace";

    expect(
      resolveHcdConnection({
        endpoint: "https://manual-hcd.example.com:8181/",
        username: "manual-user",
        password: "manual-pass",
      })
    ).toEqual({
      endpoint: "https://manual-hcd.example.com:8181",
      username: "manual-user",
      password: "manual-pass",
      keyspace: "env_keyspace",
    });

    expect(resolveHcdConnection({})).toEqual({
      endpoint: "https://env-hcd.example.com:8181",
      username: "env-user",
      password: "env-pass",
      keyspace: "env_keyspace",
    });
  });

  it("creates cached HCD clients and rejects unsafe endpoints", () => {
    expect(() =>
      getHcdDb("cassandra", "secret", "http://remote.example.com:8181")
    ).toThrow("Invalid HCD endpoint");

    const firstDb = getHcdDb(
      "cassandra",
      "secret",
      "https://hcd.example.com:8181/",
      "ks1"
    );
    const secondDb = getHcdDb(
      "cassandra",
      "secret",
      "https://hcd.example.com:8181"
    );

    expect(usernamePasswordTokenProviderMock).toHaveBeenCalledWith(
      "cassandra",
      "secret"
    );
    expect(dataApiClientMock).toHaveBeenCalledTimes(1);
    expect(dataApiClientMock).toHaveBeenCalledWith(
      expect.anything(),
      { environment: "hcd" }
    );
    expect(dbMethodMock).toHaveBeenNthCalledWith(1, "https://hcd.example.com:8181", {
      keyspace: "ks1",
    });
    expect(dbMethodMock).toHaveBeenNthCalledWith(2, "https://hcd.example.com:8181");
    expect(firstDb).toEqual({
      endpoint: "https://hcd.example.com:8181",
      options: { keyspace: "ks1" },
    });
    expect(secondDb).toEqual({
      endpoint: "https://hcd.example.com:8181",
      options: undefined,
    });
  });
});
