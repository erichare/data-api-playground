import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { resolveAstraCliConnectionMock } = vi.hoisted(() => ({
  resolveAstraCliConnectionMock: vi.fn(),
}));

vi.mock("@/lib/astraCli", () => ({
  resolveAstraCliConnection: resolveAstraCliConnectionMock,
}));

import {
  ASTRA_DEFAULT_KEYSPACE,
  getBackendStatuses,
  resolveBackendConnection,
} from "@/lib/backends/server";

const originalEnv = { ...process.env };

describe("backend server helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resolveAstraCliConnectionMock.mockReset();
    process.env = { ...originalEnv };
    delete process.env.ASTRA_DB_APPLICATION_TOKEN;
    delete process.env.ASTRA_DB_API_ENDPOINT;
    delete process.env.ASTRA_DB_KEYSPACE;
    delete process.env.HCD_DATA_API_ENDPOINT;
    delete process.env.HCD_USERNAME;
    delete process.env.HCD_PASSWORD;
    delete process.env.HCD_KEYSPACE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("resolves Astra connections with manual values and a default keyspace when requested", () => {
    const resolved = resolveBackendConnection(
      {
        backend: "astra",
        token: "AstraCS:manual",
        endpoint: "https://db.apps.astra.datastax.com/",
      },
      { includeDefaultKeyspace: true }
    );

    expect(resolved).toEqual({
      backend: "astra",
      token: "AstraCS:manual",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: ASTRA_DEFAULT_KEYSPACE,
      fromEnv: false,
    });
  });

  it("resolves Astra connections from a local Astra CLI selection", () => {
    resolveAstraCliConnectionMock.mockReturnValue({
      token: "AstraCS:cli",
      endpoint: "https://cli.apps.astra.datastax.com",
      keyspace: "cli_keyspace",
      astraCliProfile: "default",
      astraCliDatabase: "db-123",
    });

    const resolved = resolveBackendConnection({
      backend: "astra",
      fromAstraCli: true,
      astraCliProfile: "default",
      astraCliDatabase: "db-123",
    });

    expect(resolveAstraCliConnectionMock).toHaveBeenCalledWith({
      astraCliProfile: "default",
      astraCliDatabase: "db-123",
      keyspace: undefined,
    });
    expect(resolved).toEqual({
      backend: "astra",
      token: "AstraCS:cli",
      endpoint: "https://cli.apps.astra.datastax.com",
      keyspace: "cli_keyspace",
      fromEnv: false,
      fromAstraCli: true,
      astraCliProfile: "default",
      astraCliDatabase: "db-123",
    });
  });

  it("resolves HCD connections from manual and environment-backed credentials", () => {
    process.env.HCD_DATA_API_ENDPOINT = "https://env-hcd.example.com:8181/";
    process.env.HCD_USERNAME = "env-user";
    process.env.HCD_PASSWORD = "env-pass";
    process.env.HCD_KEYSPACE = "env_keyspace";

    expect(
      resolveBackendConnection({
        backend: "hcd",
        endpoint: "https://manual-hcd.example.com:8181/",
        username: "manual-user",
        password: "manual-pass",
      })
    ).toEqual({
      backend: "hcd",
      endpoint: "https://manual-hcd.example.com:8181",
      username: "manual-user",
      password: "manual-pass",
      keyspace: "env_keyspace",
      fromEnv: false,
    });

    expect(
      resolveBackendConnection({
        backend: "hcd",
      })
    ).toEqual({
      backend: "hcd",
      endpoint: "https://env-hcd.example.com:8181",
      username: "env-user",
      password: "env-pass",
      keyspace: "env_keyspace",
      fromEnv: true,
    });
  });

  it("reports backend readiness and picks the default backend in priority order", () => {
    expect(getBackendStatuses()).toEqual({
      astra: {
        kind: "astra",
        ready: false,
        hasEndpoint: false,
        hasToken: false,
      },
      hcd: {
        kind: "hcd",
        ready: false,
        hasEndpoint: false,
        hasUsername: false,
        hasPassword: false,
      },
      defaultBackend: null,
    });

    process.env.HCD_DATA_API_ENDPOINT = "https://hcd.example.com:8181";
    process.env.HCD_USERNAME = "cassandra";
    process.env.HCD_PASSWORD = "secret";
    expect(getBackendStatuses().defaultBackend).toBe("hcd");

    process.env.ASTRA_DB_APPLICATION_TOKEN = "AstraCS:env";
    process.env.ASTRA_DB_API_ENDPOINT = "https://db.apps.astra.datastax.com";
    expect(getBackendStatuses().defaultBackend).toBe("astra");
  });
});
