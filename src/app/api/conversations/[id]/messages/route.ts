import { NextResponse } from "next/server";
import { getAstraDb } from "@/lib/astra";

const CONV_COLLECTION = "dap_conversations";
const MSG_COLLECTION = "dap_messages";

// GET /api/conversations/[id]/messages?token=...&endpoint=...
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = req.headers.get("x-astra-token") ?? process.env.ASTRA_DB_APPLICATION_TOKEN ?? "";
  const endpoint = req.headers.get("x-astra-endpoint") ?? process.env.ASTRA_DB_API_ENDPOINT ?? "";

  if (!token || !endpoint) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint);
    const coll = await db.createCollection(MSG_COLLECTION);
    const docs = await coll
      .find({ conversationId: id }, { sort: { timestamp: 1 }, limit: 500 })
      .toArray();

    const messages = docs.map((d) => ({
      id: d._id as string,
      role: d.role as string,
      content: d.content as string,
      timestamp: d.timestamp as string,
      searchMode: d.searchMode,
      latencyMs: d.latencyMs,
      pipelineSteps: d.pipelineSteps,
      sources: d.sources,
    }));

    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load messages" },
      { status: 500 }
    );
  }
}

// POST /api/conversations/[id]/messages — append a message
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await req.json() as {
    message: {
      id: string;
      role: string;
      content: string;
      timestamp: string;
      searchMode?: string;
      latencyMs?: number;
      pipelineSteps?: unknown[];
      sources?: unknown[];
    };
  };

  const token = req.headers.get("x-astra-token") ?? process.env.ASTRA_DB_APPLICATION_TOKEN ?? "";
  const endpoint = req.headers.get("x-astra-endpoint") ?? process.env.ASTRA_DB_API_ENDPOINT ?? "";

  if (!token || !endpoint) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const { message } = body;
  const now = new Date().toISOString();

  try {
    const db = getAstraDb(token, endpoint);
    const msgColl = await db.createCollection(MSG_COLLECTION);

    await Promise.all([
      msgColl.insertOne({
        _id: message.id,
        conversationId: id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        ...(message.searchMode ? { searchMode: message.searchMode } : {}),
        ...(message.latencyMs != null ? { latencyMs: message.latencyMs } : {}),
        ...(message.pipelineSteps ? { pipelineSteps: message.pipelineSteps } : {}),
        ...(message.sources ? { sources: message.sources } : {}),
      }),
      db.collection(CONV_COLLECTION).updateOne(
        { _id: id },
        { $set: { updatedAt: now }, $inc: { messageCount: 1 } }
      ),
    ]);

    return NextResponse.json({ saved: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save message" },
      { status: 500 }
    );
  }
}
