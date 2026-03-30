import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { streamCsvIngest } from "@/lib/ingest/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = (await req.json()) as {
    token?: string;
    endpoint?: string;
    keyspace?: string;
    collection: string;
    rows: Record<string, string>[];
    filename: string;
  };

  const stream = streamCsvIngest({
    ...body,
    hfKey: process.env.HUGGINGFACE_API_KEY,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
    },
  });
}
