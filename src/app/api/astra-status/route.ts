import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";

export async function GET(req: Request) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  return NextResponse.json({
    hasToken: !!process.env.ASTRA_DB_APPLICATION_TOKEN,
    hasEndpoint: !!process.env.ASTRA_DB_API_ENDPOINT,
  });
}
