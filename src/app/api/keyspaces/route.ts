import { NextRequest, NextResponse } from "next/server";
import { DataAPIClient } from "@datastax/astra-db-ts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json() as { token: string; endpoint: string };
  const token = body.token || process.env.ASTRA_DB_APPLICATION_TOKEN || "";
  const endpoint = body.endpoint || process.env.ASTRA_DB_API_ENDPOINT || "";

  if (!token || !endpoint) {
    return NextResponse.json({ error: "token and endpoint are required" }, { status: 400 });
  }

  try {
    const client = new DataAPIClient(token);
    const db = client.db(endpoint);
    const admin = db.admin();
    const keyspaces = await admin.listKeyspaces();
    return NextResponse.json({ keyspaces });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list keyspaces";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
