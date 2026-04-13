import { getDb } from "@/lib/db";

// ── Row types ──────────────────────────────────────────────────────────

/** Raw SQLite row shape for the `conversations` table. */
export interface ConversationRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

/** Raw SQLite row shape for the `messages` table. */
export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  timestamp: string;
  search_mode: string | null;
  latency_ms: number | null;
  pipeline_steps: string | null;
  sources: string | null;
}

// ── Conversations ──────────────────────────────────────────────────────

/**
 * Return the 100 most recently updated conversations.
 * Ordered by `updated_at DESC` to show active conversations first.
 */
export function listConversations(): ConversationRow[] {
  return getDb()
    .prepare(
      "SELECT id, name, created_at, updated_at, message_count FROM conversations ORDER BY updated_at DESC LIMIT 100"
    )
    .all() as ConversationRow[];
}

/**
 * Insert a new conversation row and return its metadata.
 * The caller is responsible for generating the `id` and `now` timestamp.
 */
export function createConversation(args: {
  id: string;
  name: string;
  now: string;
}): void {
  getDb()
    .prepare(
      "INSERT INTO conversations (id, name, created_at, updated_at, message_count) VALUES (?, ?, ?, ?, 0)"
    )
    .run(args.id, args.name, args.now, args.now);
}

/**
 * Rename a conversation and bump its `updated_at` timestamp.
 */
export function renameConversation(args: {
  id: string;
  name: string;
  now: string;
}): void {
  getDb()
    .prepare("UPDATE conversations SET name = ?, updated_at = ? WHERE id = ?")
    .run(args.name, args.now, args.id);
}

/**
 * Delete a conversation by ID. Messages are cascade-deleted via the
 * foreign key constraint on the `messages` table.
 */
export function deleteConversation(id: string): void {
  getDb()
    .prepare("DELETE FROM conversations WHERE id = ?")
    .run(id);
}

/**
 * Look up a conversation by ID. Returns `undefined` when not found,
 * which callers use to return a 404 response.
 */
export function getConversationById(
  id: string
): Pick<ConversationRow, "id"> | undefined {
  return getDb()
    .prepare("SELECT id FROM conversations WHERE id = ?")
    .get(id) as Pick<ConversationRow, "id"> | undefined;
}

// ── Messages ───────────────────────────────────────────────────────────

/**
 * Return up to 500 messages for a conversation, ordered chronologically.
 */
export function listMessages(conversationId: string): MessageRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT 500"
    )
    .all(conversationId) as MessageRow[];
}

/**
 * Insert a message with `ON CONFLICT(id) DO NOTHING` for idempotent retries.
 * Returns the number of rows changed (0 when the ID already exists).
 */
export function insertMessage(args: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  timestamp: string;
  searchMode: string | null;
  latencyMs: number | null;
  pipelineSteps: string | null;
  sources: string | null;
}): number {
  const result = getDb()
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content, timestamp, search_mode, latency_ms, pipeline_steps, sources)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    )
    .run(
      args.id,
      args.conversationId,
      args.role,
      args.content,
      args.timestamp,
      args.searchMode,
      args.latencyMs,
      args.pipelineSteps,
      args.sources
    );

  return result.changes;
}

/**
 * Bump the conversation `updated_at` and increment `message_count`.
 * Called only when `insertMessage` actually inserts a new row (changes > 0)
 * to avoid inflating counts on idempotent retries.
 */
export function incrementMessageCount(args: {
  conversationId: string;
  now: string;
}): void {
  getDb()
    .prepare(
      "UPDATE conversations SET updated_at = ?, message_count = message_count + 1 WHERE id = ?"
    )
    .run(args.now, args.conversationId);
}
