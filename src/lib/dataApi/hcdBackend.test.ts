import { describe, expect, it, vi } from "vitest";

const {
  createDataApiBackendMock,
  createNonAstraListKeyspacesMock,
  getHcdDbMock,
} = vi.hoisted(() => ({
  createDataApiBackendMock: vi.fn(),
  createNonAstraListKeyspacesMock: vi.fn(),
  getHcdDbMock: vi.fn(),
}));

vi.mock("@/lib/dataApi/factory", () => ({
  createDataApiBackend: createDataApiBackendMock,
  createNonAstraListKeyspaces: createNonAstraListKeyspacesMock,
}));

vi.mock("@/lib/hcd", () => ({
  getHcdDb: getHcdDbMock,
}));

createDataApiBackendMock.mockReturnValue({ kind: "hcd", capabilities: {} });
createNonAstraListKeyspacesMock.mockReturnValue("list-keyspaces");

describe("hcdDataApiBackend", () => {
  it("registers HCD capabilities and uses the HCD db factory", async () => {
    const { hcdDataApiBackend } = await import("./hcdBackend");

    expect(hcdDataApiBackend).toEqual({ kind: "hcd", capabilities: {} });
    expect(createNonAstraListKeyspacesMock).toHaveBeenCalledWith(
      expect.any(Function),
      "hcd"
    );
    expect(createDataApiBackendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "hcd",
        displayName: "DataStax HCD",
        capabilities: expect.objectContaining({
          embeddingProviders: false,
          vectorizeCollections: false,
          apiProxy: true,
        }),
        listKeyspaces: "list-keyspaces",
      })
    );

    const args = createDataApiBackendMock.mock.calls[0]?.[0] as {
      createDb: (
        config: {
          backend: "hcd" | "astra";
          endpoint?: string;
          username?: string;
          password?: string;
          keyspace?: string;
        },
        keyspace?: string
      ) => unknown;
    };

    getHcdDbMock.mockReturnValue("db");
    expect(
      args.createDb({
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "cassandra",
        password: "secret",
        keyspace: "ks1",
      })
    ).toBe("db");
    expect(getHcdDbMock).toHaveBeenCalledWith(
      "cassandra",
      "secret",
      "https://hcd.example.com:8181",
      "ks1"
    );

    expect(() =>
      args.createDb({
        backend: "astra",
        endpoint: "",
      })
    ).toThrow("Invalid backend for HCD data API adapter");
    expect(() =>
      args.createDb({
        backend: "hcd",
        endpoint: "",
        username: "",
        password: "",
      })
    ).toThrow("Missing HCD endpoint, username, or password");
  });
});
