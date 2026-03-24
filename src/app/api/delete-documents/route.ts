import { NextRequest, NextResponse } from "next/server";
import { DataAPIClient } from "@datastax/astra-db-ts";

export async function POST(req: NextRequest) {
  const { token, endpoint, collection: collectionName, ids } = await req.json() as {
    token: string;
    endpoint: string;
    collection: string;
    ids: string[];
  };

  if (!token || !endpoint || !collectionName || !ids?.length) {
    return NextResponse.json({ error: "token, endpoint, collection, and ids are required" }, { status: 400 });
  }

  try {
    const client = new DataAPIClient(token);
    const db = client.db(endpoint);
    const coll = db.collection(collectionName);

    const result = await coll.deleteMany({ _id: { $in: ids } });

    return NextResponse.json({ deletedCount: result.deletedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
