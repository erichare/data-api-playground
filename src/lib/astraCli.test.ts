import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

describe("astraCli helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    execFileSyncMock.mockReset();
  });

  it("returns safe CLI status metadata and normalizes database endpoints", async () => {
    execFileSyncMock.mockImplementation((command: string, args: string[]) => {
      expect(command).toBe("astra");

      if (args[0] === "config") {
        return JSON.stringify({
          data: [
            {
              name: "default",
              isUsedAsDefault: true,
              token: "AstraCS:secret",
            },
          ],
        });
      }

      if (args[0] === "db") {
        return JSON.stringify({
          data: [
            {
              id: "db-123",
              status: "ACTIVE",
              dataEndpointUrl: "https://db-id.apps.astra.datastax.com/api/rest",
              info: {
                name: "orders",
                keyspace: "analytics",
                region: "us-east-2",
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected call: ${args.join(" ")}`);
    });

    const { getAstraCliStatus } = await import("./astraCli");
    expect(getAstraCliStatus()).toEqual({
      available: true,
      configured: true,
      profiles: [{ name: "default", isDefault: true }],
      selectedProfile: "default",
      databases: [
        {
          id: "db-123",
          name: "orders",
          endpoint: "https://db-id.apps.astra.datastax.com",
          keyspace: "analytics",
          region: "us-east-2",
          status: "ACTIVE",
        },
      ],
    });
  });

  it("resolves a CLI-backed connection using the selected profile and database", async () => {
    execFileSyncMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "config") {
        return JSON.stringify({
          data: [
            {
              name: "default",
              isUsedAsDefault: true,
              token: "AstraCS:secret",
            },
          ],
        });
      }

      return JSON.stringify({
        data: [
          {
            id: "db-123",
            status: "ACTIVE",
            dataEndpointUrl: "https://db-id.apps.astra.datastax.com/api/rest",
            info: {
              name: "orders",
              keyspace: "default_keyspace",
              region: "us-east-2",
            },
          },
        ],
      });
    });

    const { resolveAstraCliConnection } = await import("./astraCli");
    expect(
      resolveAstraCliConnection({
        astraCliProfile: "default",
        astraCliDatabase: "db-123",
      })
    ).toEqual({
      token: "AstraCS:secret",
      endpoint: "https://db-id.apps.astra.datastax.com",
      keyspace: "default_keyspace",
      astraCliProfile: "default",
      astraCliDatabase: "db-123",
    });
  });

  it("reports when the Astra CLI binary is unavailable", async () => {
    execFileSyncMock.mockImplementation(() => {
      const error = new Error("spawn astra ENOENT") as Error & { code: string };
      error.code = "ENOENT";
      throw error;
    });

    const { getAstraCliStatus } = await import("./astraCli");
    expect(getAstraCliStatus()).toEqual({
      available: false,
      configured: false,
      profiles: [],
      selectedProfile: null,
      databases: [],
      error: "Astra CLI is not installed.",
    });
  });
});
