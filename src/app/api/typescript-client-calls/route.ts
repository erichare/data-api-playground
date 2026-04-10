import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { listAstraClientCalls } from "@/lib/astraClientLog";

export async function GET(req: Request) {
  const authError = requireApiAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "60", 10);
  const boundedLimit = Number.isFinite(limit)
    ? Math.min(Math.max(limit, 1), 200)
    : 60;

  return NextResponse.json({
    calls: listAstraClientCalls(boundedLimit),
  });
}
