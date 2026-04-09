import { NextResponse } from "next/server";
import { getAiStatus } from "@/lib/ai/service";
import { requireApiAuth } from "@/lib/auth";

export async function GET(req: Request) {
  const authError = requireApiAuth(req);
  if (authError) return authError;

  return NextResponse.json(await getAiStatus());
}
