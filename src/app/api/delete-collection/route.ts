import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { deleteCollectionInAstra } from "@/lib/collections/service";
import { deleteCollectionBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = await parseJsonBody(req, deleteCollectionBodySchema);
  if (isErrorResponse(body)) return body;

  try {
    const result = await deleteCollectionInAstra(body);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete collection";
    const status =
      message === "Missing credentials" || message === "Missing collection name"
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
