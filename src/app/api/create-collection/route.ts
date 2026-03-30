import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { createCollectionInAstra } from "@/lib/collections/service";

export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = (await req.json()) as {
    token?: string;
    endpoint?: string;
    keyspace?: string;
    name: string;
    dimension: number;
    metric: string;
    provider: string;
    model: string;
  };

  try {
    const collection = await createCollectionInAstra(body);
    return NextResponse.json({ collection });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      message === "token, endpoint, and name are required" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
