import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { renameConversation, deleteConversation } from "@/lib/conversations/repository";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { conversationUpdateBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

// PATCH /api/conversations/[id] — rename
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const logContext = createRequestLogContext(req, "/api/conversations/[id]");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const { id } = await context.params;
  const result = await parseJsonBody(req, conversationUpdateBodySchema);
  if (isErrorResponse(result)) return result;

  try {
    const now = new Date().toISOString();
    renameConversation({ id, name: result.name, now });
    return NextResponse.json({ updated: true });
  } catch (err) {
    logError(logContext, "conversations.update.failed", err, { conversationId: id });
    return NextResponse.json(
      { error: sanitizeErrorForClient(err, "Failed to update conversation") },
      { status: 500 }
    );
  }
}

// DELETE /api/conversations/[id] — cascades to messages via FK
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const logContext = createRequestLogContext(req, "/api/conversations/[id]");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const { id } = await context.params;
  await req.json().catch(() => null); // consume body if present

  try {
    deleteConversation(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    logError(logContext, "conversations.delete.failed", err, { conversationId: id });
    return NextResponse.json(
      { error: sanitizeErrorForClient(err, "Failed to delete conversation") },
      { status: 500 }
    );
  }
}
