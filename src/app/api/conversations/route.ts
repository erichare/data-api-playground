import { NextResponse } from "next/server";
import { getAstraDb } from "@/lib/astra";

const CONV_COLLECTION = "dap_conversations";

// GET /api/conversations
export async function GET(req: Request) {
  const token = req.headers.get("x-astra-token") ?? process.env.ASTRA_DB_APPLICATION_TOKEN ?? "";
  const endpoint = req.headers.get("x-astra-endpoint") ?? process.env.ASTRA_DB_API_ENDPOINT ?? "";

  if (!token || !endpoint) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint);
    const coll = await db.createCollection(CONV_COLLECTION);
    const docs = await coll.find({}, { sort: { updatedAt: -1 }, limit: 100 }).toArray();

    const conversations = docs.map((d) => ({
      id: d._id as string,
      name: (d.name as string) ?? "Conversation",
      createdAt: (d.createdAt as string) ?? new Date().toISOString(),
      updatedAt: (d.updatedAt as string) ?? new Date().toISOString(),
      messageCount: (d.messageCount as number) ?? 0,
    }));

    return NextResponse.json({ conversations });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list conversations" },
      { status: 500 }
    );
  }
}

// POST /api/conversations
export async function POST(req: Request) {
  const body = await req.json() as { name?: string };
  const token = req.headers.get("x-astra-token") ?? process.env.ASTRA_DB_APPLICATION_TOKEN ?? "";
  const endpoint = req.headers.get("x-astra-endpoint") ?? process.env.ASTRA_DB_API_ENDPOINT ?? "";

  if (!token || !endpoint) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint);
    const coll = await db.createCollection(CONV_COLLECTION);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await coll.insertOne({
      _id: id,
      name: body.name ?? "New Conversation",
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    });

    return NextResponse.json({
      conversation: { id, name: body.name ?? "New Conversation", createdAt: now, updatedAt: now, messageCount: 0 },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create conversation" },
      { status: 500 }
    );
  }
}
