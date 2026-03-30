import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type ConvRow = { id: string; name: string; created_at: string; updated_at: string; message_count: number };

// GET /api/conversations
export async function GET(req: Request) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const db = getDb();
  const rows = db
    .prepare("SELECT id, name, created_at, updated_at, message_count FROM conversations ORDER BY updated_at DESC LIMIT 100")
    .all() as ConvRow[];

  const conversations = rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
  }));

  return NextResponse.json({ conversations });
}

// POST /api/conversations
export async function POST(req: Request) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = await req.json() as { name?: string };
  const db = getDb();

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const name = body.name ?? "New Conversation";

  db.prepare(
    "INSERT INTO conversations (id, name, created_at, updated_at, message_count) VALUES (?, ?, ?, ?, 0)"
  ).run(id, name, now, now);

  return NextResponse.json({ conversation: { id, name, createdAt: now, updatedAt: now, messageCount: 0 } });
}
