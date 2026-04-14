import { NextRequest, NextResponse } from "next/server";
import {
  isAuthEnabled,
  isAuthenticatedRequest,
  isAuthMisconfigured,
  isPublicAccessAllowed,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  const enabled = isAuthEnabled();
  return NextResponse.json({
    enabled,
    authenticated: enabled ? isAuthenticatedRequest(req) : false,
    publicAccessAllowed: isPublicAccessAllowed(),
    misconfigured: isAuthMisconfigured(),
  });
}
