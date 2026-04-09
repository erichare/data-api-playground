import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { streamCsvIngest } from "@/lib/ingest/service";
import { ingestBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = await parseJsonBody(req, ingestBodySchema);
  if (isErrorResponse(body)) return body;

  const stream = streamCsvIngest({
    ...body,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
    },
  });
}
