import { NextResponse } from "next/server";
import { getAstraCliStatus } from "@/lib/astraCli";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const authError = requireApiAuth(req);
  if (authError) return authError;

  const profile = new URL(req.url).searchParams.get("profile") ?? undefined;

  return NextResponse.json({
    astraCli: getAstraCliStatus(profile),
  });
}
