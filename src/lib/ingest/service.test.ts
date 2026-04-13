import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DOCUMENT_UPLOAD_BYTES,
  MAX_DOCUMENT_UPLOAD_MB,
} from "@/lib/ingest/constants";

const insertManyMock = vi.fn();
const deleteManyMock = vi.fn();
const listCollectionsMock = vi.fn();
const getAstraDbMock = vi.fn(() => ({
  collection: vi.fn(() => ({
    insertMany: insertManyMock,
    deleteMany: deleteManyMock,
  })),
  listCollections: listCollectionsMock,
}));
const resolveAstraConnectionMock = vi.fn();
const duplicateByHashGetMock = vi.fn();
const filenameConflictAllMock = vi.fn();
const insertDocumentRunMock = vi.fn();
const deleteExistingRunMock = vi.fn();
const prepareMock = vi.fn((sql: string) => {
  if (sql.includes("WHERE collection = ? AND content_hash = ?")) {
    return { get: duplicateByHashGetMock };
  }
  if (sql.includes("WHERE collection = ? AND source_filename = ?")) {
    return { all: filenameConflictAllMock };
  }
  if (sql.includes("INSERT INTO ingested_documents")) {
    return { run: insertDocumentRunMock };
  }
  if (sql.includes("DELETE FROM ingested_documents WHERE source_doc_id = ?")) {
    return { run: deleteExistingRunMock };
  }
  throw new Error(`Unhandled SQL in test: ${sql}`);
});
const transactionMock = vi.fn(
  (callback: (sourceDocIds: string[]) => void) => (sourceDocIds: string[]) =>
    callback(sourceDocIds)
);
const getDbMock = vi.fn(() => ({
  prepare: prepareMock,
  transaction: transactionMock,
}));

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  resolveAstraConnection: resolveAstraConnectionMock,
}));

vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

describe("ingest service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    duplicateByHashGetMock.mockReturnValue(undefined);
    filenameConflictAllMock.mockReturnValue([]);
    insertDocumentRunMock.mockReturnValue(undefined);
    deleteExistingRunMock.mockReturnValue(undefined);
    insertManyMock.mockResolvedValue(undefined);
    deleteManyMock.mockResolvedValue({ deletedCount: 1 });
  });

  it("chunks long text into multiple ingest slices", async () => {
    const { chunkText } = await import("./text");
    const chunks = chunkText(
      "A".repeat(900) + "\n\n" + "B".repeat(900),
      1000,
      100
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.length).toBeLessThanOrEqual(1000);
  });

  it("chunks uploaded CSV files as one chunk per row", async () => {
    listCollectionsMock.mockResolvedValue([
      {
        name: "docs",
        definition: { vector: { service: { provider: "nvidia" } } },
      },
    ]);

    const { streamDocumentIngest } = await import("./service");
    const response = new Response(
      streamDocumentIngest({
        filename: "rows.csv",
        fileType: "csv",
        collectionName: "docs",
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        chunkSize: 800,
        metadata: {},
        buffer: Buffer.from("name,city\nAda,London\nGrace,New York\n"),
      })
    );

    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "chunked",
        chunks: 2,
      })
    );
    expect(insertManyMock).toHaveBeenCalledWith([
      expect.objectContaining({
        content: "name: Ada; city: London",
        $vectorize: "name: Ada; city: London",
      }),
      expect.objectContaining({
        content: "name: Grace; city: New York",
        $vectorize: "name: Grace; city: New York",
      }),
    ]);
  });

  it("chunks uploaded XLSX files as one chunk per row", async () => {
    listCollectionsMock.mockResolvedValue([
      {
        name: "docs",
        definition: { vector: { service: { provider: "nvidia" } } },
      },
    ]);

    const writeXlsxFile = (await import("write-excel-file/node")).default;
    const workbook = await writeXlsxFile(
      [
        ["name", "city"],
        ["Ada", "London"],
        ["Grace", "New York"],
      ],
      {
        buffer: true,
        sheet: "People",
      }
    );

    const { streamDocumentIngest } = await import("./service");
    const response = new Response(
      streamDocumentIngest({
        filename: "rows.xlsx",
        fileType: "xlsx",
        collectionName: "docs",
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        chunkSize: 800,
        metadata: {},
        buffer: workbook,
      })
    );

    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "chunked",
        chunks: 2,
      })
    );
    expect(insertManyMock).toHaveBeenCalledWith([
      expect.objectContaining({
        content: "name: Ada; city: London",
        $vectorize: "name: Ada; city: London",
      }),
      expect.objectContaining({
        content: "name: Grace; city: New York",
        $vectorize: "name: Grace; city: New York",
      }),
    ]);
  });

  it("streams vectorize csv ingest progress through Astra", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });
    listCollectionsMock.mockResolvedValue([
      {
        name: "docs",
        definition: { vector: { service: { provider: "nvidia" } } },
      },
    ]);

    const { streamCsvIngest } = await import("./service");
    const response = new Response(
      streamCsvIngest({
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        collection: "docs",
        filename: "rows.csv",
        rows: [
          { title: "First row", category: "a" },
          { title: "Second row", category: "b" },
        ],
      })
    );

    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events[0]).toMatchObject({
      type: "start",
      total: 2,
      collection: "docs",
      useVectorize: true,
    });
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      processed: 2,
      total: 2,
    });
    expect(insertManyMock).toHaveBeenCalledWith([
      expect.objectContaining({
        title: "First row",
        category: "a",
        $vectorize: "title: First row; category: a",
      }),
      expect.objectContaining({
        title: "Second row",
        category: "b",
        $vectorize: "title: Second row; category: b",
      }),
    ]);
  });

  it("rejects oversized document uploads before reading them into Astra", async () => {
    const { parseDocumentUpload } = await import("./service");
    const formData = new FormData();
    const oversized = new File(
      [new Uint8Array(MAX_DOCUMENT_UPLOAD_BYTES + 1)],
      "too-large.txt",
      { type: "text/plain" }
    );

    formData.set("file", oversized);
    formData.set("collection", "docs");

    await expect(parseDocumentUpload(formData)).rejects.toThrow(
      `File exceeds ${MAX_DOCUMENT_UPLOAD_MB} MB upload limit`
    );
  });

  it("parses optional name conflict actions from document uploads", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });

    const { parseDocumentUpload } = await import("./service");
    const formData = new FormData();
    formData.set(
      "file",
      new File(["hello"], "report.txt", { type: "text/plain" })
    );
    formData.set("collection", "docs");
    formData.set("nameConflictAction", "overwrite");

    await expect(parseDocumentUpload(formData)).resolves.toMatchObject({
      filename: "report.txt",
      collectionName: "docs",
      nameConflictAction: "overwrite",
    });
  });

  it("recognizes xlsx uploads as spreadsheets", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });

    const { parseDocumentUpload } = await import("./service");
    const formData = new FormData();
    formData.set(
      "file",
      new File([new Uint8Array([0x50, 0x4b])], "sheet.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    formData.set("collection", "docs");

    await expect(parseDocumentUpload(formData)).resolves.toMatchObject({
      filename: "sheet.xlsx",
      fileType: "xlsx",
    });
  });

  it("emits an error when CSV ingest exceeds the row safety limit", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });

    const { streamCsvIngest } = await import("./service");
    const response = new Response(
      streamCsvIngest({
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        collection: "docs",
        filename: "rows.csv",
        rows: Array.from({ length: 5001 }, (_, index) => ({ row: String(index) })),
      })
    );

    const payload = await response.text();

    expect(payload).toContain(
      "CSV ingest supports at most 5,000 rows per request"
    );
    expect(getAstraDbMock).not.toHaveBeenCalled();
  });

  it("skips document ingest when an identical hash already exists in the collection", async () => {
    duplicateByHashGetMock.mockReturnValue({
      source_doc_id: "doc-existing",
      source_filename: "report.txt",
      content_hash: "same-hash",
      ingested_at: "2026-04-09T20:00:00.000Z",
      collection: "docs",
    });

    const { streamDocumentIngest } = await import("./service");
    const response = new Response(
      streamDocumentIngest({
        filename: "copy.txt",
        fileType: "txt",
        collectionName: "docs",
        chunkSize: 800,
        metadata: {},
        buffer: Buffer.from("hello world"),
      })
    );

    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toEqual([
      expect.objectContaining({
        type: "skipped",
        reason: "duplicate_hash",
        source_doc_id: "doc-existing",
      }),
    ]);
    expect(insertDocumentRunMock).not.toHaveBeenCalled();
    expect(getAstraDbMock).not.toHaveBeenCalled();
  });

  it("emits a conflict event when a different file with the same name already exists", async () => {
    filenameConflictAllMock.mockReturnValue([
      {
        source_doc_id: "doc-existing",
        source_filename: "report.txt",
        content_hash: "old-hash",
        ingested_at: "2026-04-09T20:00:00.000Z",
        collection: "docs",
      },
    ]);

    const { streamDocumentIngest } = await import("./service");
    const response = new Response(
      streamDocumentIngest({
        filename: "report.txt",
        fileType: "txt",
        collectionName: "docs",
        chunkSize: 800,
        metadata: {},
        buffer: Buffer.from("new contents"),
      })
    );

    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toEqual([
      expect.objectContaining({
        type: "conflict",
        reason: "name_conflict",
        existing_source_doc_id: "doc-existing",
      }),
    ]);
    expect(insertDocumentRunMock).not.toHaveBeenCalled();
  });

  it("deletes matching Astra and sqlite data before overwriting a filename conflict", async () => {
    filenameConflictAllMock.mockReturnValue([
      {
        source_doc_id: "doc-old-1",
        source_filename: "report.txt",
        content_hash: "old-hash-1",
        ingested_at: "2026-04-09T19:00:00.000Z",
        collection: "docs",
      },
      {
        source_doc_id: "doc-old-2",
        source_filename: "report.txt",
        content_hash: "old-hash-2",
        ingested_at: "2026-04-09T18:00:00.000Z",
        collection: "docs",
      },
    ]);
    listCollectionsMock.mockResolvedValue([
      {
        name: "docs",
        definition: { vector: { service: { provider: "nvidia" } } },
      },
    ]);

    const { streamDocumentIngest } = await import("./service");
    const response = new Response(
      streamDocumentIngest({
        filename: "report.txt",
        fileType: "txt",
        collectionName: "docs",
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        chunkSize: 800,
        metadata: {},
        buffer: Buffer.from("replacement body with enough text to make a chunk"),
        nameConflictAction: "overwrite",
      })
    );

    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(deleteManyMock).toHaveBeenNthCalledWith(1, {
      "metadata.source_doc_id": { $eq: "doc-old-1" },
    });
    expect(deleteManyMock).toHaveBeenNthCalledWith(2, {
      "metadata.source_doc_id": { $eq: "doc-old-2" },
    });
    expect(deleteExistingRunMock).toHaveBeenNthCalledWith(1, "doc-old-1");
    expect(deleteExistingRunMock).toHaveBeenNthCalledWith(2, "doc-old-2");
    expect(insertManyMock).toHaveBeenCalledTimes(1);
    expect(insertDocumentRunMock).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      collection: "docs",
      replaced_source_doc_ids: ["doc-old-1", "doc-old-2"],
    });
  });

  it("emits an error when streamCsvIngest is called with missing token or empty rows", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "",
      endpoint: "",
      keyspace: undefined,
    });

    const { streamCsvIngest } = await import("./service");
    const response = new Response(
      streamCsvIngest({
        token: "",
        endpoint: "",
        collection: "docs",
        filename: "rows.csv",
        rows: [],
      })
    );

    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toEqual([
      expect.objectContaining({
        type: "error",
        message: "token, endpoint, collection, and rows are required",
      }),
    ]);
    expect(getAstraDbMock).not.toHaveBeenCalled();
  });

  it("emits an error when streamCsvIngest listCollections throws", async () => {
    resolveAstraConnectionMock.mockReturnValue({
      token: "token",
      endpoint: "endpoint",
      keyspace: "ks1",
    });
    listCollectionsMock.mockRejectedValue(new Error("Network failure"));

    const { streamCsvIngest } = await import("./service");
    const response = new Response(
      streamCsvIngest({
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        collection: "docs",
        filename: "rows.csv",
        rows: [{ title: "First row" }],
      })
    );

    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toEqual([
      expect.objectContaining({
        type: "error",
        message: "Network failure",
      }),
    ]);
  });

  it("emits a skipped event with reason name_conflict when nameConflictAction is skip", async () => {
    filenameConflictAllMock.mockReturnValue([
      {
        source_doc_id: "doc-existing",
        source_filename: "report.txt",
        content_hash: "old-hash",
        ingested_at: "2026-04-09T20:00:00.000Z",
        collection: "docs",
      },
    ]);

    const { streamDocumentIngest } = await import("./service");
    const response = new Response(
      streamDocumentIngest({
        filename: "report.txt",
        fileType: "txt",
        collectionName: "docs",
        chunkSize: 800,
        metadata: {},
        buffer: Buffer.from("new contents"),
        nameConflictAction: "skip",
      })
    );

    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toEqual([
      expect.objectContaining({
        type: "skipped",
        reason: "name_conflict",
        source_doc_id: "doc-existing",
      }),
    ]);
    expect(insertDocumentRunMock).not.toHaveBeenCalled();
    expect(getAstraDbMock).not.toHaveBeenCalled();
  });

  it("runs demo mode when token and endpoint are empty, emitting complete with demo: true", async () => {
    vi.useFakeTimers();

    const { streamDocumentIngest } = await import("./service");
    const stream = streamDocumentIngest({
      filename: "demo.txt",
      fileType: "txt",
      collectionName: "",
      token: "",
      endpoint: "",
      chunkSize: 800,
      metadata: {},
      buffer: Buffer.from("Hello world demo content"),
    });

    const responsePromise = new Response(stream).text();
    await vi.runAllTimersAsync();
    const payload = await responsePromise;

    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "complete",
        demo: true,
      })
    );
    expect(getAstraDbMock).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("emits an error when extracted text exceeds MAX_EXTRACTED_TEXT_CHARS", async () => {
    listCollectionsMock.mockResolvedValue([
      {
        name: "docs",
        definition: { vector: { service: { provider: "nvidia" } } },
      },
    ]);

    const { MAX_EXTRACTED_TEXT_CHARS } = await import("./constants");

    // Build a buffer whose plain-text extraction exceeds the character limit.
    // txt files go through extractText which returns the utf8 decoded content.
    const oversizedText = "A".repeat(MAX_EXTRACTED_TEXT_CHARS + 1);

    const { streamDocumentIngest } = await import("./service");
    const response = new Response(
      streamDocumentIngest({
        filename: "big.txt",
        fileType: "txt",
        collectionName: "docs",
        token: "token",
        endpoint: "endpoint",
        keyspace: "ks1",
        chunkSize: 800,
        metadata: {},
        buffer: Buffer.from(oversizedText),
      })
    );

    const payload = await response.text();
    const events = payload
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("Extracted text exceeds"),
      })
    );
  });
});
