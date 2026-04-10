import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DATA_API_PLAYGROUND_DB_PATH || path.join(DATA_DIR, "app.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(DATA_DIR, { recursive: true });
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
      md5_hash        TEXT NOT NULL,
      chunk_total     INTEGER NOT NULL,
      collection      TEXT NOT NULL,
      ingested_at     TEXT NOT NULL,
      metadata        TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_docs_ingested_at ON ingested_documents(ingested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_docs_collection_md5 ON ingested_documents(collection, md5_hash);
    CREATE INDEX IF NOT EXISTS idx_docs_collection_filename ON ingested_documents(collection, source_filename);
  `);

  return _db;
}
