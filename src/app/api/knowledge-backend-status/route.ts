import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { getKnowledgeBackendStatuses } from "@/lib/knowledge/server";

export async function GET(req: Request) {
  const authError = requireApiAuth(req);
  if (authError) return authError;

  return NextResponse.json(getKnowledgeBackendStatuses());
}
