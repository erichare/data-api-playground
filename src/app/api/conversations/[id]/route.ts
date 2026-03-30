import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// PATCH /api/conversations/[id] — rename
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const { id } = await context.params;
  const body = await req.json() as { name: string };
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("UPDATE conversations SET name = ?, updated_at = ? WHERE id = ?").run(body.name, now, id);
  return NextResponse.json({ updated: true });
}

// DELETE /api/conversations/[id] — cascades to messages via FK
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const { id } = await context.params;
  await req.json().catch(() => null); // consume body if present
  const db = getDb();
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  return NextResponse.json({ deleted: true });
}
