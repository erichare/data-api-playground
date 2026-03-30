import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";

export async function GET(req: Request) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  return NextResponse.json({
    hasKey: !!process.env.WATSONX_API_KEY,
    hasProjectId: !!process.env.WATSONX_PROJECT_ID,
  });
}
