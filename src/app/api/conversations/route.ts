import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { listConversations, createConversation } from "@/lib/conversations/repository";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { conversationCreateBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

// GET /api/conversations
export async function GET(req: Request) {
  const logContext = createRequestLogContext(req, "/api/conversations");
  const authError = requireApiAuth(req);
  if (authError) return authError;

  try {
    const rows = listConversations();

    const conversations = rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      messageCount: r.message_count,
    }));

    return NextResponse.json({ conversations });
  } catch (err) {
    logError(logContext, "conversations.list.failed", err);
    return NextResponse.json(
      { error: sanitizeErrorForClient(err, "Failed to list conversations") },
      { status: 500 }
    );
  }
}

// POST /api/conversations
export async function POST(req: Request) {
  const logContext = createRequestLogContext(req, "/api/conversations");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, conversationCreateBodySchema);
  if (isErrorResponse(result)) return result;

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const name = result.name ?? "New Conversation";

    createConversation({ id, name, now });

    return NextResponse.json({ conversation: { id, name, createdAt: now, updatedAt: now, messageCount: 0 } });
  } catch (err) {
    logError(logContext, "conversations.create.failed", err);
    return NextResponse.json(
      { error: sanitizeErrorForClient(err, "Failed to create conversation") },
      { status: 500 }
    );
  }
}
