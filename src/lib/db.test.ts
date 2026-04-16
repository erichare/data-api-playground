import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mkdirSyncMock = vi.fn();
const pragmaMock = vi.fn();
const execMock = vi.fn();
const DatabaseMock = vi.fn(function Database() {
  return {
    pragma: pragmaMock,
    exec: execMock,
  };
});

vi.mock("fs", () => ({
  default: { mkdirSync: mkdirSyncMock },
  mkdirSync: mkdirSyncMock,
}));

vi.mock("better-sqlite3", () => ({
  default: DatabaseMock,
}));

describe("getDb", () => {
  const originalPath = process.env.DATA_API_PLAYGROUND_DB_PATH;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    pragmaMock.mockImplementation((statement: string) => {
      if (statement === "user_version") return 0;
      if (statement === "user_version = 4") return undefined;
      if (statement === "table_info(ingested_documents)") {
        return [
          { name: "source_doc_id" },
          { name: "source_filename" },
          { name: "file_type" },
          { name: "file_size" },
          { name: "md5_hash" },
          { name: "chunk_total" },
          { name: "collection" },
          { name: "ingested_at" },
          { name: "metadata" },
        ];
      }
      return undefined;
    });
  });

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.DATA_API_PLAYGROUND_DB_PATH;
    } else {
      process.env.DATA_API_PLAYGROUND_DB_PATH = originalPath;
    }
  });

  it("creates the parent directory for an overridden database path", async () => {
    process.env.DATA_API_PLAYGROUND_DB_PATH = "/tmp/data-api-playground/custom/app.db";

    const { getDb } = await import("./db");

    getDb();

    expect(mkdirSyncMock).toHaveBeenCalledWith(
      "/tmp/data-api-playground/custom",
      { recursive: true }
    );
    expect(DatabaseMock).toHaveBeenCalledWith(
      "/tmp/data-api-playground/custom/app.db"
    );
    expect(pragmaMock).toHaveBeenCalledWith("journal_mode = WAL");
    expect(pragmaMock).toHaveBeenCalledWith("foreign_keys = ON");
    expect(execMock).toHaveBeenCalledWith(
      "ALTER TABLE ingested_documents RENAME COLUMN md5_hash TO content_hash"
    );
    expect(execMock).toHaveBeenCalledWith("DROP INDEX IF EXISTS idx_docs_collection_md5");
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("CREATE INDEX IF NOT EXISTS idx_docs_collection_hash")
    );
    expect(execMock).toHaveBeenCalledWith(
      "ALTER TABLE ingested_documents ADD COLUMN backend_kind TEXT"
    );
    expect(execMock).toHaveBeenCalledWith(
      "ALTER TABLE ingested_documents ADD COLUMN backend_source TEXT"
    );
    expect(execMock).toHaveBeenCalledWith(
      "ALTER TABLE ingested_documents ADD COLUMN backend_document_ref TEXT"
    );
    expect(execMock).toHaveBeenCalledWith(
      "ALTER TABLE ingested_documents ADD COLUMN backend_scope TEXT"
    );
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("SET")
    );
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("CREATE INDEX IF NOT EXISTS idx_docs_backend_lookup")
    );
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("CREATE INDEX IF NOT EXISTS idx_docs_backend_scope")
    );
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS ingested_document_chunks")
    );
    expect(pragmaMock).toHaveBeenCalledWith("table_info(ingested_documents)");
    expect(pragmaMock).toHaveBeenCalledWith("user_version", { simple: true });
    expect(pragmaMock).toHaveBeenCalledWith("user_version = 4");
  });

  it("skips migrations when the schema version is already current", async () => {
    process.env.DATA_API_PLAYGROUND_DB_PATH = "/tmp/data-api-playground/current/app.db";
    pragmaMock.mockImplementation((statement: string) => {
      if (statement === "user_version") return 4;
      return undefined;
    });

    const { getDb } = await import("./db");

    getDb();

    expect(execMock).toHaveBeenCalledTimes(1);
    expect(execMock).not.toHaveBeenCalledWith(
      "ALTER TABLE ingested_documents RENAME COLUMN md5_hash TO content_hash"
    );
    expect(pragmaMock).toHaveBeenCalledWith("user_version", { simple: true });
    expect(pragmaMock).not.toHaveBeenCalledWith("table_info(ingested_documents)");
    expect(pragmaMock).not.toHaveBeenCalledWith("user_version = 4");
  });
});
