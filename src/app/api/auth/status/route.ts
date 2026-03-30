import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, isAuthenticatedRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    enabled: isAuthEnabled(),
    authenticated: isAuthenticatedRequest(req),
  });
}
