import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveBackendConnectionMock,
  astraKnowledgeBackendMock,
  hcdKnowledgeBackendMock,
  openragKnowledgeBackendMock,
} = vi.hoisted(() => ({
  resolveBackendConnectionMock: vi.fn(),
  astraKnowledgeBackendMock: {
    kind: "astra",
    capabilities: { vectorSearch: true },
  },
  hcdKnowledgeBackendMock: {
    kind: "hcd",
    capabilities: { vectorSearch: true, csvIngest: true },
  },
  openragKnowledgeBackendMock: {
    kind: "openrag",
    capabilities: { vectorSearch: true, csvIngest: false },
  },
}));

vi.mock("@/lib/backends/server", () => ({
  resolveBackendConnection: resolveBackendConnectionMock,
}));

vi.mock("@/lib/knowledge/astraBackend", () => ({
  astraKnowledgeBackend: astraKnowledgeBackendMock,
}));

vi.mock("@/lib/knowledge/hcdBackend", () => ({
  hcdKnowledgeBackend: hcdKnowledgeBackendMock,
}));

vi.mock("@/lib/knowledge/openragBackend", () => ({
  openragKnowledgeBackend: openragKnowledgeBackendMock,
}));

const originalEnv = { ...process.env };

describe("knowledge index helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENRAG_API_KEY;
    delete process.env.OPENRAG_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("resolves OpenRAG config from manual values and environment fallbacks", async () => {
    const { resolveKnowledgeBackendConfig } = await import("./index");

    expect(
      resolveKnowledgeBackendConfig({
        knowledgeBackend: "openrag",
        openragApiKey: "orag_manual",
        openragBaseUrl: "https://openrag.example.com/",
      })
    ).toEqual({
      kind: "openrag",
      apiKey: "orag_manual",
      baseUrl: "https://openrag.example.com",
      fromEnv: false,
    });

    process.env.OPENRAG_API_KEY = "orag_env";
    expect(
      resolveKnowledgeBackendConfig({
        knowledgeBackend: "openrag",
      })
    ).toEqual({
      kind: "openrag",
      apiKey: "orag_env",
      baseUrl: "http://localhost:3000",
      fromEnv: true,
    });
  });

  it("routes connected backends through the shared resolver and returns matching adapters", async () => {
    const {
      getKnowledgeBackend,
      resolveKnowledgeBackend,
      resolveKnowledgeBackendConfig,
    } = await import("./index");

    resolveBackendConnectionMock.mockReturnValue({
      backend: "hcd",
      endpoint: "https://hcd.example.com:8181",
      username: "cassandra",
      password: "secret",
      keyspace: "ks1",
    });

    expect(
      resolveKnowledgeBackendConfig({
        backend: "hcd",
      })
    ).toEqual({
      backend: "hcd",
      endpoint: "https://hcd.example.com:8181",
      username: "cassandra",
      password: "secret",
      keyspace: "ks1",
    });

    expect(getKnowledgeBackend("astra")).toBe(astraKnowledgeBackendMock);
    expect(getKnowledgeBackend("hcd")).toBe(hcdKnowledgeBackendMock);
    expect(getKnowledgeBackend("openrag")).toBe(openragKnowledgeBackendMock);

    expect(
      resolveKnowledgeBackend({
        knowledgeBackend: "openrag",
        openragApiKey: "orag_manual",
      })
    ).toEqual({
      config: {
        kind: "openrag",
        apiKey: "orag_manual",
        baseUrl: "http://localhost:3000",
        fromEnv: false,
      },
      backend: openragKnowledgeBackendMock,
      capabilities: openragKnowledgeBackendMock.capabilities,
    });

    expect(
      resolveKnowledgeBackend({
        backend: "hcd",
      })
    ).toEqual({
      config: {
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "cassandra",
        password: "secret",
        keyspace: "ks1",
      },
      backend: hcdKnowledgeBackendMock,
      capabilities: hcdKnowledgeBackendMock.capabilities,
    });
  });
});
