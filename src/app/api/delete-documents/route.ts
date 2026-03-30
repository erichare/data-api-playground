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
    ids: string[];
  };
  const { token, endpoint, keyspace } = resolveAstraConnection(body, { includeDefaultKeyspace: true });
  const { collection: collectionName, ids } = body;

  if (!token || !endpoint || !collectionName || !ids?.length) {
    return NextResponse.json({ error: "token, endpoint, collection, and ids are required" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);
    const coll = db.collection(collectionName);

    const result = await coll.deleteMany({ _id: { $in: ids } });

    return NextResponse.json({ deletedCount: result.deletedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
