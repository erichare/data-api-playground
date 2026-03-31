import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import { requireApiAuth } from "@/lib/auth";
import { keyspacesBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, keyspacesBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint } = resolveAstraConnection(result);

  if (!token || !endpoint) {
    return NextResponse.json({ error: "token and endpoint are required" }, { status: 400 });
  }

  try {
    const admin = getAstraDb(token, endpoint).admin();
    const keyspaces = await admin.listKeyspaces();
    return NextResponse.json({ keyspaces });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list keyspaces";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
