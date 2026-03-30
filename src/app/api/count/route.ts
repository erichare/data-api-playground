import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import { requireApiAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = await req.json() as {
    token?: string;
    endpoint?: string;
    keyspace?: string;
    collection: string;
  };
  const { token, endpoint, keyspace } = resolveAstraConnection(body, { includeDefaultKeyspace: true });
  const { collection } = body;

  if (!token || !endpoint || !collection) {
    return NextResponse.json({ error: "token, endpoint, and collection are required" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);
    const count = await db.collection(collection).estimatedDocumentCount();
    return NextResponse.json({ count });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
