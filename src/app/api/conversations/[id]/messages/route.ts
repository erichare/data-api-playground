import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import {
  getConversationById,
  listMessages,
  insertMessage,
  incrementMessageCount,
} from "@/lib/conversations/repository";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { messageCreateBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

// GET /api/conversations/[id]/messages
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const logContext = createRequestLogContext(req, "/api/conversations/[id]/messages");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const { id } = await context.params;

  try {
    const conversation = getConversationById(id);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const rows = listMessages(id);

    const messages = rows.map((r) => {
      let pipelineSteps: unknown;
      let sources: unknown;
      try { pipelineSteps = r.pipeline_steps ? JSON.parse(r.pipeline_steps) : undefined; } catch { pipelineSteps = undefined; }
      try { sources = r.sources ? JSON.parse(r.sources) : undefined; } catch { sources = undefined; }
      return {
        id: r.id,
        role: r.role,
        content: r.content,
        timestamp: r.timestamp,
        searchMode: r.search_mode ?? undefined,
        latencyMs: r.latency_ms ?? undefined,
        pipelineSteps,
        sources,
      };
    });

    return NextResponse.json({ messages });
  } catch (err) {
    logError(logContext, "messages.list.failed", err, { conversationId: id });
    return NextResponse.json(
      { error: sanitizeErrorForClient(err, "Failed to load messages") },
      { status: 500 }
    );
  }
}

// POST /api/conversations/[id]/messages — append one message
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const logContext = createRequestLogContext(req, "/api/conversations/[id]/messages");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const { id } = await context.params;
  const result = await parseJsonBody(req, messageCreateBodySchema);
  if (isErrorResponse(result)) return result;
  const { message } = result;

  try {
    const now = new Date().toISOString();

    const changes = insertMessage({
      id: message.id,
      conversationId: id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      searchMode: message.searchMode ?? null,
      latencyMs: message.latencyMs ?? null,
      pipelineSteps: message.pipelineSteps ? JSON.stringify(message.pipelineSteps) : null,
      sources: message.sources ? JSON.stringify(message.sources) : null,
    });

    // Avoid inflating counts when the client retries a message with the same ID.
    if (changes > 0) {
      incrementMessageCount({ conversationId: id, now });
    }

    return NextResponse.json({ saved: true });
  } catch (err) {
    logError(logContext, "messages.create.failed", err, { conversationId: id });
    return NextResponse.json(
      { error: sanitizeErrorForClient(err, "Failed to save message") },
      { status: 500 }
    );
  }
}
