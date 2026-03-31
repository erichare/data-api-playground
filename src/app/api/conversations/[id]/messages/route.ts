import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type MsgRow = {
  id: string; conversation_id: string; role: string; content: string;
  timestamp: string; search_mode: string | null; latency_ms: number | null;
  pipeline_steps: string | null; sources: string | null;
};

// GET /api/conversations/[id]/messages
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const { id } = await context.params;
  const db = getDb();

  const rows = db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT 500")
    .all(id) as MsgRow[];

  const messages = rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    timestamp: r.timestamp,
    searchMode: r.search_mode ?? undefined,
    latencyMs: r.latency_ms ?? undefined,
    pipelineSteps: r.pipeline_steps ? JSON.parse(r.pipeline_steps) : undefined,
    sources: r.sources ? JSON.parse(r.sources) : undefined,
  }));

  return NextResponse.json({ messages });
}

// POST /api/conversations/[id]/messages — append one message
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const { id } = await context.params;
  const body = await req.json() as {
    message: {
      id: string; role: string; content: string; timestamp: string;
      searchMode?: string; latencyMs?: number;
      pipelineSteps?: unknown[]; sources?: unknown[];
    };
  };
  const { message } = body;
  const db = getDb();
  const now = new Date().toISOString();

  const insertResult = db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, timestamp, search_mode, latency_ms, pipeline_steps, sources)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(
    message.id, id, message.role, message.content, message.timestamp,
    message.searchMode ?? null,
    message.latencyMs ?? null,
    message.pipelineSteps ? JSON.stringify(message.pipelineSteps) : null,
    message.sources ? JSON.stringify(message.sources) : null,
  );

  // Avoid inflating counts when the client retries a message with the same ID.
  if (insertResult.changes > 0) {
    db.prepare("UPDATE conversations SET updated_at = ?, message_count = message_count + 1 WHERE id = ?").run(now, id);
  }

  return NextResponse.json({ saved: true });
}
