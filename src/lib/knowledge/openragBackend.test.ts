import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  openRAGClientMock,
  searchQueryMock,
  documentsIngestMock,
  documentsDeleteMock,
  settingsGetMock,
  getDbMock,
  prepareMock,
} = vi.hoisted(() => ({
  openRAGClientMock: vi.fn(),
  searchQueryMock: vi.fn(),
  documentsIngestMock: vi.fn(),
  documentsDeleteMock: vi.fn(),
  settingsGetMock: vi.fn(),
  getDbMock: vi.fn(),
  prepareMock: vi.fn(),
}));

vi.mock("openrag-sdk", () => ({
  OpenRAGClient: openRAGClientMock,
}));

vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

import {
  __setOpenragLoggerForTests,
  createOpenragDocumentRef,
  openragKnowledgeBackend,
} from "@/lib/knowledge/openragBackend";

describe("openragKnowledgeBackend", () => {
  const config = {
    kind: "openrag" as const,
    apiKey: "orag_secret",
    baseUrl: "https://openrag.example.com",
  };

  let collectionRows: Array<{ collection: string }>;
  let filenameRows: Array<{ collection: string; source_filename: string }>;
  let chunkRows: Array<{ chunk_index: number; content: string }>;
  let logEntries: Array<{
    level: "warn" | "error";
    event: string;
    details: Record<string, unknown>;
  }>;

  beforeEach(() => {
    vi.clearAllMocks();
    collectionRows = [];
    filenameRows = [];
    chunkRows = [];
    logEntries = [];
    __setOpenragLoggerForTests((level, event, details) => {
      logEntries.push({ level, event, details });
    });

    openRAGClientMock.mockImplementation(function OpenRAGClient() {
      return {
        search: { query: searchQueryMock },
        documents: {
          ingest: documentsIngestMock,
          delete: documentsDeleteMock,
        },
        settings: { get: settingsGetMock },
      };
    });

    prepareMock.mockImplementation((sql: string) => {
      if (sql.includes("SELECT DISTINCT collection")) {
        return {
          all: vi.fn(() => collectionRows),
        };
      }

      if (sql.includes("SELECT collection, source_filename")) {
        return {
          all: vi.fn(() => filenameRows),
        };
      }

      if (sql.includes("SELECT chunk_index, content")) {
        return {
          all: vi.fn(() => chunkRows),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    getDbMock.mockReturnValue({
      prepare: prepareMock,
    });
  });

  afterEach(() => {
    __setOpenragLoggerForTests(null);
  });

  it("lists logical sources from local metadata and enriches them with OpenRAG settings", async () => {
    collectionRows = [{ collection: "orders" }, { collection: "support" }];
    settingsGetMock.mockResolvedValue({
      agent: {},
      knowledge: {
        embedding_provider: "openai",
        embedding_model: "text-embedding-3-large",
      },
    });

    await expect(openragKnowledgeBackend.listSources(config)).resolves.toEqual([
      {
        name: "orders",
        vectorDimension: null,
        vectorizeProvider: "openai",
        vectorizeModel: "text-embedding-3-large",
      },
      {
        name: "support",
        vectorDimension: null,
        vectorizeProvider: "openai",
        vectorizeModel: "text-embedding-3-large",
      },
    ]);
  });

  it("falls back to default provider metadata when settings are unavailable and logs the failure", async () => {
    collectionRows = [{ collection: "orders" }];
    settingsGetMock.mockRejectedValue(new Error("settings unavailable"));

    await expect(openragKnowledgeBackend.listSources(config)).resolves.toEqual([
      {
        name: "orders",
        vectorDimension: null,
        vectorizeProvider: "openrag",
        vectorizeModel: null,
      },
    ]);

    const settingsLog = logEntries.find((entry) => entry.event === "settings.get_failed");
    expect(settingsLog).toBeDefined();
    expect(settingsLog?.level).toBe("warn");
    expect(settingsLog?.details.errorMessage).toBe("settings unavailable");
    expect(settingsLog?.details.hint).toMatch(/falling back/i);
  });

  it("logs and rethrows when search, ingest, or delete fail at the SDK boundary", async () => {
    searchQueryMock.mockRejectedValue(new Error("search boom"));
    await expect(
      openragKnowledgeBackend.search({
        config,
        query: "boom",
        collection: "orders",
        collections: [],
        collectionsToSearch: [],
        userCollections: ["orders"],
        searchMode: "vector",
        sortField: null,
        sortDir: "desc",
        limit: 3,
        filterField: null,
        filterOp: null,
        filterValue: null,
        embeddingVector: [],
      })
    ).rejects.toThrow("search boom");
    const searchLog = logEntries.find((entry) => entry.event === "search.query_failed");
    expect(searchLog?.level).toBe("error");
    expect(searchLog?.details.collection).toBe("orders");
    expect(searchLog?.details.limit).toBe(3);

    documentsIngestMock.mockRejectedValue(new Error("ingest boom"));
    await expect(
      openragKnowledgeBackend.ingestDocument(
        {
          config,
          sourceDocId: "doc-9",
          collectionName: "orders",
          filename: "broken.pdf",
          fileType: "pdf",
          text: "data",
          fileBytes: new Uint8Array([1]),
          chunks: ["data"],
          metadata: {},
        },
        vi.fn()
      )
    ).rejects.toThrow("ingest boom");
    const ingestLog = logEntries.find((entry) => entry.event === "documents.ingest_failed");
    expect(ingestLog?.level).toBe("error");
    expect(ingestLog?.details.filename).toBe("broken.pdf");
    expect(ingestLog?.details.collectionName).toBe("orders");

    documentsDeleteMock.mockRejectedValue(new Error("delete boom"));
    await expect(
      openragKnowledgeBackend.deleteDocument({
        config,
        source: "orders",
        documentRef: "broken.pdf",
      })
    ).rejects.toThrow("delete boom");
    const deleteLog = logEntries.find((entry) => entry.event === "documents.delete_failed");
    expect(deleteLog?.level).toBe("error");
    expect(deleteLog?.details.filename).toBe("broken.pdf");
    expect(deleteLog?.details.source).toBe("orders");
  });

  it("maps semantic search results back onto logical collections", async () => {
    filenameRows = [{ collection: "orders", source_filename: "report.pdf" }];
    searchQueryMock.mockResolvedValue({
      results: [
        {
          filename: "report.pdf",
          text: "Quarterly report summary",
          score: 0.92,
          page: 2,
          mimetype: "application/pdf",
        },
      ],
    });

    const result = await openragKnowledgeBackend.search({
      config,
      query: "quarterly report",
      collection: "orders",
      collections: [],
      collectionsToSearch: [{ name: "orders", isVec: true }],
      userCollections: ["orders"],
      searchMode: "vector",
      sortField: null,
      sortDir: "desc",
      limit: 5,
      filterField: null,
      filterOp: null,
      filterValue: null,
      embeddingVector: [],
    });

    expect(searchQueryMock).toHaveBeenCalledWith("quarterly report", {
      filters: { data_sources: ["report.pdf"] },
      limit: 5,
    });
    expect(result.searchResults).toEqual([
      {
        id: "report.pdf:2:0",
        similarity: 0.92,
        preview: {
          filename: "report.pdf",
          excerpt: "Quarterly report summary",
          page: 2,
          mimetype: "application/pdf",
        },
        collection: "orders",
      },
    ]);
    expect(result.commandStr).toContain("openrag.search.query");
  });

  it("rejects unsupported search modes and handles searches without filename filters", async () => {
    searchQueryMock.mockResolvedValue({
      results: [
        {
          filename: "floating.txt",
          text: "A".repeat(260),
          score: 0.61,
          page: null,
          mimetype: null,
        },
      ],
    });

    await expect(
      openragKnowledgeBackend.search({
        config,
        query: "quarterly report",
        collection: "orders",
        collections: [],
        collectionsToSearch: [],
        userCollections: ["orders"],
        searchMode: "hybrid",
        sortField: null,
        sortDir: "desc",
        limit: 2,
        filterField: null,
        filterOp: null,
        filterValue: null,
        embeddingVector: [],
      })
    ).rejects.toThrow("supports vector search only");

    const result = await openragKnowledgeBackend.search({
      config,
      query: "floating doc",
      collection: "orders",
      collections: [],
      collectionsToSearch: [],
      userCollections: ["orders"],
      searchMode: "vector",
      sortField: null,
      sortDir: "desc",
      limit: 2,
      filterField: null,
      filterOp: null,
      filterValue: null,
      embeddingVector: [],
    });

    expect(searchQueryMock).toHaveBeenLastCalledWith("floating doc", {
      filters: undefined,
      limit: 2,
    });
    expect(result.searchResults).toEqual([
      {
        id: "floating.txt:chunk:0",
        similarity: 0.61,
        preview: {
          filename: "floating.txt",
          excerpt: `${"A".repeat(217)}...`,
        },
        collection: "orders",
      },
    ]);
    expect(result.commandStr).toBe(
      'await openrag.search.query("floating doc", { limit: 2 })'
    );
  });

  it("rejects unsupported CSV ingest", async () => {
    await expect(
      openragKnowledgeBackend.ingestCsv(
        {
          config,
          collection: "orders",
          rows: [{ title: "Quarterly report" }],
          filename: "rows.csv",
        },
        vi.fn()
      )
    ).rejects.toThrow("does not support CSV row ingest");
  });

  it("uploads documents, deletes by filename, and loads local chunk content", async () => {
    documentsIngestMock.mockResolvedValue({ status: "completed", task_id: "task-1" });
    documentsDeleteMock.mockResolvedValue({
      success: true,
      deleted_chunks: 4,
    });
    chunkRows = [
      { chunk_index: 0, content: "First chunk" },
      { chunk_index: 1, content: "Second chunk" },
    ];

    const send = vi.fn();
    await openragKnowledgeBackend.ingestDocument(
      {
        config,
        sourceDocId: "doc-1",
        collectionName: "orders",
        filename: "report.pdf",
        fileType: "pdf",
        text: "First chunk\n\nSecond chunk",
        fileBytes: new Uint8Array([1, 2, 3]),
        chunks: ["First chunk", "Second chunk"],
        metadata: {},
      },
      send
    );

    expect(documentsIngestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.any(File),
        filename: "report.pdf",
      })
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "backend_info",
        provider: "openrag",
      })
    );

    const documentRef = createOpenragDocumentRef({
      filename: "report.pdf",
      sourceDocId: "doc-1",
    });

    await openragKnowledgeBackend.deleteDocument({
      config,
      source: "orders",
      documentRef,
    });
    expect(documentsDeleteMock).toHaveBeenCalledWith("report.pdf");

    await expect(
      openragKnowledgeBackend.loadDocumentContent({
        config,
        source: "orders",
        documentRef,
      })
    ).resolves.toEqual(chunkRows);
  });

  it("accepts legacy string refs and validates OpenRAG config", async () => {
    chunkRows = [{ chunk_index: 0, content: "Only chunk" }];

    await openragKnowledgeBackend.deleteDocument({
      config,
      source: "orders",
      documentRef: "legacy.txt",
    });
    expect(documentsDeleteMock).toHaveBeenCalledWith("legacy.txt");

    await expect(
      openragKnowledgeBackend.loadDocumentContent({
        config,
        source: "orders",
        documentRef: "legacy.txt",
      })
    ).resolves.toEqual([]);

    await expect(
      openragKnowledgeBackend.listSources({
        backend: "astra",
        token: "AstraCS:token",
        endpoint: "https://db.apps.astra.datastax.com",
      })
    ).rejects.toThrow("configuration is invalid");

    await expect(
      openragKnowledgeBackend.listSources({
        kind: "openrag",
        apiKey: "",
        baseUrl: "https://openrag.example.com",
      })
    ).rejects.toThrow("requires an API key");
  });
});
