import { NextRequest } from "next/server";
import { parseDocumentUpload, streamDocumentIngest } from "@/lib/ingest/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseDocumentUpload(await req.formData());
    const stream = streamDocumentIngest({
      ...parsed,
      hfKey: process.env.HUGGINGFACE_API_KEY,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No file provided";
    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }
}
