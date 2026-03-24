import { NextResponse } from "next/server";
import { getAstraDb } from "@/lib/astra";

const CONV_COLLECTION = "dap_conversations";
const MSG_COLLECTION = "dap_messages";

// PATCH /api/conversations/[id] — rename
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await req.json() as { name: string };
  const token = req.headers.get("x-astra-token") ?? process.env.ASTRA_DB_APPLICATION_TOKEN ?? "";
  const endpoint = req.headers.get("x-astra-endpoint") ?? process.env.ASTRA_DB_API_ENDPOINT ?? "";

  if (!token || !endpoint) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint);
    const now = new Date().toISOString();
    await db.collection(CONV_COLLECTION).updateOne(
      { _id: id },
      { $set: { name: body.name, updatedAt: now } }
    );
    return NextResponse.json({ updated: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to rename" },
      { status: 500 }
    );
  }
}

// DELETE /api/conversations/[id] — delete conversation + all its messages
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  await req.json();
  const token = req.headers.get("x-astra-token") ?? process.env.ASTRA_DB_APPLICATION_TOKEN ?? "";
  const endpoint = req.headers.get("x-astra-endpoint") ?? process.env.ASTRA_DB_API_ENDPOINT ?? "";

  if (!token || !endpoint) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint);
    await Promise.all([
      db.collection(CONV_COLLECTION).deleteOne({ _id: id }),
      db.collection(MSG_COLLECTION).deleteMany({ conversationId: id }),
    ]);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete" },
      { status: 500 }
    );
  }
}
