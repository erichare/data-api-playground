import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json() as {
    token?: string;
    endpoint?: string;
    keyspace?: string;
    collection: string;
    requestBody: Record<string, unknown>;
  };

  const token = body.token || process.env.ASTRA_DB_APPLICATION_TOKEN || "";
  const endpoint = (body.endpoint || process.env.ASTRA_DB_API_ENDPOINT || "").replace(/\/$/, "");
  const keyspace = body.keyspace || "default_keyspace";
  const { collection, requestBody } = body;

  if (!token || !endpoint) {
    return NextResponse.json({ error: "Missing Astra DB token or endpoint" }, { status: 400 });
  }
  if (!collection) {
    return NextResponse.json({ error: "Missing collection name" }, { status: 400 });
  }

  const url = `${endpoint}/api/json/v1/${keyspace}/${collection}`;
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Token": token,
      },
      body: JSON.stringify(requestBody),
    });

    const latencyMs = Date.now() - start;
    const data: unknown = await res.json();

    return NextResponse.json({ status: res.status, statusText: res.statusText, latencyMs, data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 }
    );
  }
}
