/**
 * SQLite database initialization and schema management.
 *
 * Provides a singleton `Database` instance for local persistence of
 * conversations, messages, and ingested document metadata. The database
 * file defaults to `./data/app.db` and can be overridden via
 * `DATA_API_PLAYGROUND_DB_PATH`.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- The SQLite path is resolved from trusted local configuration and stays within the app workspace. */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DATA_API_PLAYGROUND_DB_PATH || path.join(DATA_DIR, "app.db");
const DB_DIR = path.dirname(DB_PATH);

let _db: Database.Database | null = null;
const SCHEMA_VERSION = 3;

type TableInfoRow = { name: string };

const KNOWN_TABLES = new Set([
  "ingested_document_chunks",
  "ingested_documents",
  "conversations",
  "messages",
]);

function getColumnNames(db: Database.Database, table: string) {
  if (!KNOWN_TABLES.has(table)) {
    throw new Error(`Unknown table: ${table}`);
  }
  return new Set(
    ((db.pragma(`table_info(${table})`) as TableInfoRow[]) ?? []).map((row) =>
      String(row.name)
    )
  );
}

function runMigrations(db: Database.Database) {
  const currentVersion = Number(
    db.pragma("user_version", { simple: true }) ?? 0
  );

  if (currentVersion < 1) {
    const ingestedDocumentColumns = getColumnNames(db, "ingested_documents");
    if (
      ingestedDocumentColumns.has("md5_hash") &&
      !ingestedDocumentColumns.has("content_hash")
    ) {
      db.exec(
        "ALTER TABLE ingested_documents RENAME COLUMN md5_hash TO content_hash"
      );
    }

    db.exec("DROP INDEX IF EXISTS idx_docs_collection_md5");
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_docs_ingested_at ON ingested_documents(ingested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_docs_collection_hash ON ingested_documents(collection, content_hash);
      CREATE INDEX IF NOT EXISTS idx_docs_collection_filename ON ingested_documents(collection, source_filename);
    `);
  }

  if (currentVersion < 2) {
    const ingestedDocumentColumns = getColumnNames(db, "ingested_documents");

    if (!ingestedDocumentColumns.has("backend_kind")) {
      db.exec("ALTER TABLE ingested_documents ADD COLUMN backend_kind TEXT");
    }
    if (!ingestedDocumentColumns.has("backend_source")) {
      db.exec("ALTER TABLE ingested_documents ADD COLUMN backend_source TEXT");
    }
    if (!ingestedDocumentColumns.has("backend_document_ref")) {
      db.exec("ALTER TABLE ingested_documents ADD COLUMN backend_document_ref TEXT");
    }

    db.exec(`
      UPDATE ingested_documents
      SET
        backend_kind = COALESCE(NULLIF(TRIM(backend_kind), ''), 'astra'),
        backend_source = COALESCE(NULLIF(TRIM(backend_source), ''), collection),
        backend_document_ref = COALESCE(NULLIF(TRIM(backend_document_ref), ''), source_doc_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_docs_backend_lookup
      ON ingested_documents(backend_kind, backend_source)
    `);
  }

  if (currentVersion < 3) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ingested_document_chunks (
        source_doc_id TEXT NOT NULL REFERENCES ingested_documents(source_doc_id) ON DELETE CASCADE,
        chunk_index   INTEGER NOT NULL,
        content       TEXT NOT NULL,
        PRIMARY KEY (source_doc_id, chunk_index)
      );

      CREATE INDEX IF NOT EXISTS idx_doc_chunks_source
      ON ingested_document_chunks(source_doc_id, chunk_index);
    `);
  }

  if (currentVersion < SCHEMA_VERSION) {
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
}

/**
 * Return the singleton SQLite database instance, creating it on first call.
 * Enables WAL mode and foreign keys, creates tables if they don't exist,
 * and runs any pending schema migrations.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL DEFAULT 'New Conversation',
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      timestamp       TEXT NOT NULL,
      search_mode     TEXT,
      latency_ms      INTEGER,
      pipeline_steps  TEXT,
      sources         TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, timestamp);

    CREATE TABLE IF NOT EXISTS ingested_documents (
      source_doc_id   TEXT PRIMARY KEY,
      source_filename TEXT NOT NULL,
      file_type       TEXT NOT NULL,
      file_size       INTEGER NOT NULL,
      content_hash    TEXT NOT NULL,
      chunk_total     INTEGER NOT NULL,
      collection      TEXT NOT NULL,
      backend_kind    TEXT NOT NULL DEFAULT 'astra',
      backend_source  TEXT,
      backend_document_ref TEXT,
      ingested_at     TEXT NOT NULL,
      metadata        TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS ingested_document_chunks (
      source_doc_id TEXT NOT NULL REFERENCES ingested_documents(source_doc_id) ON DELETE CASCADE,
      chunk_index   INTEGER NOT NULL,
      content       TEXT NOT NULL,
      PRIMARY KEY (source_doc_id, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS idx_doc_chunks_source
    ON ingested_document_chunks(source_doc_id, chunk_index);
  `);
  runMigrations(_db);

  return _db;
}
