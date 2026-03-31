import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import { requireApiAuth } from "@/lib/auth";
import { countBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, countBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint, keyspace } = resolveAstraConnection(result, { includeDefaultKeyspace: true });
  const { collection } = result;

  if (!token || !endpoint || !collection) {
    return NextResponse.json({ error: "token, endpoint, and collection are required" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);
    const count = await db.collection(collection).estimatedDocumentCount();
    return NextResponse.json({ count });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
