import { beforeEach, describe, expect, it, vi } from "vitest";

const createCollectionMock = vi.fn();
const dropCollectionMock = vi.fn();
const deleteManyMock = vi.fn();
const collectionMock = vi.fn(() => ({
  deleteMany: deleteManyMock,
}));
const getAstraDbMock = vi.fn(() => ({
  createCollection: createCollectionMock,
  dropCollection: dropCollectionMock,
  collection: collectionMock,
}));
const resolveAstraConnectionMock = vi.fn();
const prepareMock = vi.fn();
const getDbMock = vi.fn(() => ({
  prepare: prepareMock,
}));

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
  SYSTEM_FIELDS: new Set(["_id", "$vector"]),
}));

vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

describe("collection service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareMock.mockReset();
    resolveAstraConnectionMock.mockReset();
    createCollectionMock.mockReset();
    dropCollectionMock.mockReset();
    deleteManyMock.mockReset();
    collectionMock.mockReset();
    getAstraDbMock.mockReset();

    createCollectionMock.mockResolvedValue(undefined);
    dropCollectionMock.mockResolvedValue(undefined);
    deleteManyMock.mockResolvedValue({ deletedCount: 1 });
    collectionMock.mockImplementation(() => ({
      deleteMany: deleteManyMock,
    }));
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });
    getAstraDbMock.mockImplementation(() => ({
      createCollection: createCollectionMock,
      dropCollection: dropCollectionMock,
      collection: collectionMock,
    }));
  });

  it("creates a vectorize collection through Astra and returns UI metadata", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });

    const { createCollectionInAstra } = await import("./service");
    await expect(
      createCollectionInAstra({
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        name: "docs",
        dimension: 1024,
        metric: "cosine",
        provider: "nvidia",
        model: "NV-Embed-QA",
      })
    ).resolves.toEqual({
      name: "docs",
      count: 0,
      documentCount: 0,
      vectorDim: 1024,
      vectorizeService: {
        provider: "nvidia",
        modelName: "NV-Embed-QA",
      },
    });

    expect(createCollectionMock).toHaveBeenCalledWith("docs", {
      vector: {
        dimension: 1024,
        metric: "cosine",
        service: {
          provider: "nvidia",
          modelName: "NV-Embed-QA",
        },
      },
    });
  });

  it("lists ingested document summaries from sqlite rows", async () => {
    prepareMock.mockReturnValueOnce({
      all: () => [
        {
          source_doc_id: "doc-1",
          source_filename: "report.pdf",
          file_type: "pdf",
          file_size: 5120,
          content_hash: "abc",
          chunk_total: 3,
          collection: "docs",
          ingested_at: "2026-03-30T10:00:00.000Z",
        },
      ],
    });

    const { listIngestedDocuments } = await import("./service");
    expect(listIngestedDocuments("docs")).toEqual([
      {
        source_doc_id: "doc-1",
        source_filename: "report.pdf",
        file_type: "pdf",
        file_size: 5120,
        content_hash: "abc",
        chunk_total: 3,
        collection: "docs",
        ingested_at: "2026-03-30T10:00:00.000Z",
      },
    ]);
    expect(prepareMock).toHaveBeenCalledWith(
      "SELECT * FROM ingested_documents WHERE collection = ? ORDER BY ingested_at DESC LIMIT 500"
    );
  });

  it("merges sqlite document counts with Astra chunk counts for collection metadata", async () => {
    const estimatedDocumentCountMock = vi.fn().mockResolvedValue(12);
    const findMock = vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue([{ _id: "1", title: "A" }]),
    }));

    prepareMock.mockReturnValueOnce({
      all: () => [
        { collection: "docs", document_count: 3 },
        { collection: "notes", document_count: 1 },
      ],
    });
    (getAstraDbMock as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      admin: vi.fn(() => ({
        listKeyspaces: vi.fn().mockResolvedValue(["ks1"]),
      })),
      listCollections: vi.fn().mockResolvedValue([
        {
          name: "docs",
          definition: { vector: { dimension: 1024 } },
        },
        {
          name: "images",
          definition: { vector: { dimension: 512 } },
        },
      ]),
      collection: vi.fn((name: string) => ({
        estimatedDocumentCount:
          name === "docs" ? estimatedDocumentCountMock : vi.fn().mockResolvedValue(7),
        find:
          name === "docs"
            ? findMock
            : vi.fn(() => ({
                toArray: vi.fn().mockResolvedValue([{ _id: "2", caption: "Sunset" }]),
              })),
      })),
    }));

    const { fetchCollectionMetadata } = await import("./service");
    await expect(
      fetchCollectionMetadata({
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
      })
    ).resolves.toMatchObject({
      collections: [
        {
          name: "docs",
          count: 12,
          documentCount: 3,
          vectorDim: 1024,
          vectorizeService: null,
        },
        {
          name: "images",
          count: 7,
          documentCount: 0,
          vectorDim: 512,
          vectorizeService: null,
        },
      ],
      fields: {
        docs: ["title"],
        images: ["caption"],
      },
      keyspaces: ["ks1"],
      resolvedKeyspace: "ks1",
    });

    expect(prepareMock).toHaveBeenCalledWith(
      "SELECT collection, COUNT(*) AS document_count FROM ingested_documents GROUP BY collection"
    );
    expect(estimatedDocumentCountMock).toHaveBeenCalledOnce();
    expect(findMock).toHaveBeenCalledOnce();
  });

  it("lists ingested documents across collections when no collection filter is provided", async () => {
    prepareMock.mockReturnValueOnce({
      all: () => [
        {
          source_doc_id: "doc-2",
          source_filename: "notes.md",
          file_type: "md",
          file_size: 128,
          content_hash: "def",
          chunk_total: 1,
          collection: "notes",
          ingested_at: "2026-03-31T10:00:00.000Z",
        },
      ],
    });

    const { listIngestedDocuments } = await import("./service");
    expect(listIngestedDocuments()).toEqual([
      {
        source_doc_id: "doc-2",
        source_filename: "notes.md",
        file_type: "md",
        file_size: 128,
        content_hash: "def",
        chunk_total: 1,
        collection: "notes",
        ingested_at: "2026-03-31T10:00:00.000Z",
      },
    ]);
    expect(prepareMock).toHaveBeenCalledWith(
      "SELECT * FROM ingested_documents ORDER BY ingested_at DESC LIMIT 500"
    );
  });

  it("creates non-vectorize collections without attaching a service config", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });

    const { createCollectionInAstra } = await import("./service");
    await expect(
      createCollectionInAstra({
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        name: "plain_docs",
        dimension: 384,
        metric: "dot_product",
        provider: "none",
        model: "",
      })
    ).resolves.toEqual({
      name: "plain_docs",
      count: 0,
      documentCount: 0,
      vectorDim: 384,
      vectorizeService: null,
    });

    expect(createCollectionMock).toHaveBeenCalledWith("plain_docs", {
      vector: {
        dimension: 384,
        metric: "dot_product",
      },
    });
  });

  it("validates required collection creation inputs", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "",
      endpoint: "endpoint",
      keyspace: "ks1",
    });

    const { createCollectionInAstra } = await import("./service");
    await expect(
      createCollectionInAstra({
        token: "",
        endpoint: "endpoint",
        keyspace: "ks1",
        name: "docs",
        dimension: 1024,
        metric: "cosine",
        provider: "none",
        model: "",
      })
    ).rejects.toThrow("token, endpoint, and name are required");
  });

  it("validates required HCD collection creation inputs", async () => {
    const { createCollection } = await import("./service");
    await expect(
      createCollection({
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "",
        password: "",
        keyspace: "ks1",
        name: "docs",
        dimension: 1024,
        metric: "cosine",
        provider: "none",
        model: "",
      })
    ).rejects.toThrow("endpoint, username, password, and name are required");
  });

  it("drops Astra collections after validating the connection details", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });

    const { deleteCollectionInAstra } = await import("./service");
    await expect(
      deleteCollectionInAstra({
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        name: "docs",
      })
    ).resolves.toEqual({ dropped: true });

    expect(dropCollectionMock).toHaveBeenCalledWith("docs");
  });

  it("rejects collection deletion when credentials or the collection name are missing", async () => {
    const { deleteCollectionInAstra } = await import("./service");

    resolveAstraConnectionMock.mockReturnValueOnce({
      token: "",
      endpoint: "",
      keyspace: "ks1",
    });
    await expect(
      deleteCollectionInAstra({
        token: "",
        endpoint: "",
        keyspace: "ks1",
        name: "docs",
      })
    ).rejects.toThrow("Missing credentials");

    resolveAstraConnectionMock.mockReturnValueOnce({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });
    await expect(
      deleteCollectionInAstra({
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        name: "",
      })
    ).rejects.toThrow("Missing collection name");
  });

  it("rejects HCD collection deletion when credentials are missing", async () => {
    const { deleteCollection } = await import("./service");
    await expect(
      deleteCollection({
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "cassandra",
        password: "",
        keyspace: "ks1",
        name: "docs",
      })
    ).rejects.toThrow("Missing credentials");
  });

  it("deletes ingested document metadata locally and remotely when Astra credentials are present", async () => {
    const runMock = vi.fn();
    prepareMock.mockImplementation((sql: string) => {
      if (sql.includes("SELECT")) {
        return { get: vi.fn().mockReturnValue(undefined) };
      }
      return { run: runMock };
    });
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });

    const { deleteIngestedDocument } = await import("./service");
    await expect(
      deleteIngestedDocument({
        source_doc_id: "doc-7",
        collection: "docs",
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
      })
    ).resolves.toEqual({ ok: true });

    expect(prepareMock).toHaveBeenCalledWith(
      "DELETE FROM ingested_documents WHERE source_doc_id = ?"
    );
    expect(runMock).toHaveBeenCalledWith("doc-7");
    expect(collectionMock).toHaveBeenCalledWith("docs");
    expect(deleteManyMock).toHaveBeenCalledWith({
      "metadata.source_doc_id": { $eq: "doc-7" },
    });
  });

  it("fails the delete when Astra cleanup fails and preserves local metadata", async () => {
    const runMock = vi.fn();
    prepareMock.mockImplementation((sql: string) => {
      if (sql.includes("SELECT")) {
        return { get: vi.fn().mockReturnValue(undefined) };
      }
      return { run: runMock };
    });
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });
    deleteManyMock.mockRejectedValueOnce(new Error("boom"));

    const { deleteIngestedDocument } = await import("./service");
    await expect(
      deleteIngestedDocument({
        source_doc_id: "doc-8",
        collection: "docs",
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
      })
    ).rejects.toThrow("boom");

    expect(runMock).not.toHaveBeenCalled();
  });

  it("skips remote cleanup when Astra credentials are unavailable", async () => {
    const runMock = vi.fn();
    prepareMock.mockReset();
    prepareMock.mockReturnValue({ run: runMock });
    resolveAstraConnectionMock.mockReturnValue({
      token: "",
      endpoint: "",
      keyspace: "ks1",
    });

    const { deleteIngestedDocument } = await import("./service");
    await expect(
      deleteIngestedDocument({
        source_doc_id: "doc-9",
        collection: "docs",
        token: "",
        endpoint: "",
        keyspace: "ks1",
      })
    ).resolves.toEqual({ ok: true });

    expect(runMock).toHaveBeenCalledWith("doc-9");
    expect(getAstraDbMock).not.toHaveBeenCalled();
  });

  it("rejects chunk loading when no usable backend credentials are available", async () => {
    prepareMock.mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
    });

    const { loadIngestedDocumentContent } = await import("./service");
    await expect(
      loadIngestedDocumentContent({
        backend: "hcd",
        source_doc_id: "doc-10",
        collection: "docs",
        endpoint: "",
        username: "",
        password: "",
        keyspace: "ks1",
      })
    ).rejects.toThrow("Missing credentials");
  });
});
