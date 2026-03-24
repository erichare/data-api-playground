import { NextRequest, NextResponse } from "next/server";
import { DataAPIClient } from "@datastax/astra-db-ts";

export async function POST(req: NextRequest) {
  const { token, endpoint, collection } = await req.json() as {
    token: string;
    endpoint: string;
    collection: string;
  };

  if (!token || !endpoint || !collection) {
    return NextResponse.json({ error: "token, endpoint, and collection are required" }, { status: 400 });
  }

  try {
    const client = new DataAPIClient(token);
    const db = client.db(endpoint);
    const count = await db.collection(collection).estimatedDocumentCount();
    return NextResponse.json({ count });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
