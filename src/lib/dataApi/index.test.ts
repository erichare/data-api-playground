import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveBackendConnectionMock,
  astraDataApiBackendMock,
  hcdDataApiBackendMock,
} = vi.hoisted(() => ({
  resolveBackendConnectionMock: vi.fn(),
  astraDataApiBackendMock: {
    kind: "astra",
    capabilities: { connect: true },
  },
  hcdDataApiBackendMock: {
    kind: "hcd",
    capabilities: { connect: true, keyspaces: true },
  },
}));

vi.mock("@/lib/backends/server", () => ({
  resolveBackendConnection: resolveBackendConnectionMock,
}));

vi.mock("@/lib/dataApi/astraBackend", () => ({
  astraDataApiBackend: astraDataApiBackendMock,
}));

vi.mock("@/lib/dataApi/hcdBackend", () => ({
  hcdDataApiBackend: hcdDataApiBackendMock,
}));

describe("dataApi index helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns backends by kind and config", async () => {
    const {
      getDataApiBackend,
      getResolvedDataApiBackend,
      resolveDataApiBackend,
    } = await import("./index");

    expect(getDataApiBackend("astra")).toBe(astraDataApiBackendMock);
    expect(getDataApiBackend("hcd")).toBe(hcdDataApiBackendMock);
    expect(
      getResolvedDataApiBackend({
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "cassandra",
        password: "secret",
      })
    ).toBe(hcdDataApiBackendMock);

    resolveBackendConnectionMock.mockReturnValue({
      backend: "astra",
      token: "AstraCS:token",
      endpoint: "https://db.apps.astra.datastax.com",
    });

    expect(resolveDataApiBackend({ backend: "astra" })).toEqual({
      config: {
        backend: "astra",
        token: "AstraCS:token",
        endpoint: "https://db.apps.astra.datastax.com",
      },
      backend: astraDataApiBackendMock,
      capabilities: astraDataApiBackendMock.capabilities,
    });
    expect(resolveBackendConnectionMock).toHaveBeenCalledWith(
      { backend: "astra" },
      undefined
    );
  });
});
