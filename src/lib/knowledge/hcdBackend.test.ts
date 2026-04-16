import { describe, expect, it, vi } from "vitest";

const {
  createDataApiKnowledgeBackendMock,
  resolveDataApiIngestContextMock,
  getHcdDbMock,
} = vi.hoisted(() => ({
  createDataApiKnowledgeBackendMock: vi.fn(),
  resolveDataApiIngestContextMock: vi.fn(),
  getHcdDbMock: vi.fn(),
}));

vi.mock("@/lib/knowledge/astraBackend", () => ({
  createDataApiKnowledgeBackend: createDataApiKnowledgeBackendMock,
  resolveDataApiIngestContext: resolveDataApiIngestContextMock,
}));

vi.mock("@/lib/hcd", () => ({
  getHcdDb: getHcdDbMock,
}));

createDataApiKnowledgeBackendMock.mockReturnValue({
  kind: "hcd",
  capabilities: { vectorSearch: true },
});

describe("hcdKnowledgeBackend", () => {
  it("registers the HCD knowledge adapter and reuses the ingest context resolver", async () => {
    const { hcdKnowledgeBackend, resolveHcdIngestContext } = await import("./hcdBackend");

    expect(hcdKnowledgeBackend).toEqual({
      kind: "hcd",
      capabilities: { vectorSearch: true },
    });
    expect(createDataApiKnowledgeBackendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "hcd",
        displayName: "DataStax HCD",
      })
    );

    const backendArgs = createDataApiKnowledgeBackendMock.mock.calls[0]?.[0] as {
      createDb: (config: {
        backend: "hcd" | "astra";
        endpoint?: string;
        username?: string;
        password?: string;
        keyspace?: string;
      }) => unknown;
    };
    getHcdDbMock.mockReturnValue("db");

    expect(
      backendArgs.createDb({
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "cassandra",
        password: "secret",
      })
    ).toBe("db");
    expect(getHcdDbMock).toHaveBeenCalledWith(
      "cassandra",
      "secret",
      "https://hcd.example.com:8181",
      undefined
    );
    expect(() =>
      backendArgs.createDb({
        backend: "astra",
      })
    ).toThrow("Invalid backend for HCD knowledge adapter");

    resolveHcdIngestContext({
      config: {
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "cassandra",
        password: "secret",
      },
      collectionName: "orders",
      huggingfaceApiKey: "hf-key",
    });

    expect(resolveDataApiIngestContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ backend: "hcd" }),
        collectionName: "orders",
        huggingfaceApiKey: "hf-key",
        displayName: "DataStax HCD",
        createDb: expect.any(Function),
      })
    );
  });
});
