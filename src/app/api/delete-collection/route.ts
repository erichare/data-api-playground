import { NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json() as {
    token?: string;
    endpoint?: string;
    keyspace?: string;
    name: string;
  };

  const { token, endpoint, keyspace } = resolveAstraConnection(body, { includeDefaultKeyspace: true });

  if (!token || !endpoint) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  if (!body.name) {
    return NextResponse.json({ error: "Missing collection name" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);
    await db.dropCollection(body.name);
    return NextResponse.json({ dropped: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete collection" },
      { status: 500 }
    );
  }
}
