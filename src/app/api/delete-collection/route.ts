import { NextResponse } from "next/server";
import { deleteCollectionInAstra } from "@/lib/collections/service";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    token?: string;
    endpoint?: string;
    keyspace?: string;
    name: string;
  };

  try {
    const result = await deleteCollectionInAstra(body);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete collection";
    const status =
      message === "Missing credentials" || message === "Missing collection name"
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
