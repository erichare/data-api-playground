import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection, SYSTEM_FIELDS } from "@/lib/astra";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = await req.json() as { token: string; endpoint: string; keyspace?: string };
  const { token, endpoint, keyspace } = resolveAstraConnection(body);

  if (!token || !endpoint) {
    return NextResponse.json({ error: "token and endpoint are required" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);

    const colls = await db.listCollections({ nameOnly: false });

    const collections = await Promise.all(
      colls.map(async (c) => {
        let count = 0;
        try {
          count = await db.collection(c.name).estimatedDocumentCount();
        } catch { /* leave count at 0 if unsupported */ }
        const vectorDef = c.definition?.vector;
        const svc = vectorDef?.service;
        return {
          name: c.name,
          vectorDim: vectorDef?.dimension ?? null,
          vectorizeService: svc ? { provider: svc.provider, modelName: svc.modelName } : null,
          count,
        };
      })
    );

    // Sample field names from each collection in the background
    const fields: Record<string, string[]> = {};
    await Promise.all(
      collections.map(async (c) => {
        try {
          const sample = await db.collection(c.name).find({}, { limit: 3 }).toArray();
          const fieldSet = new Set<string>();
          for (const doc of sample) {
            for (const key of Object.keys(doc)) {
              if (!SYSTEM_FIELDS.has(key)) fieldSet.add(key);
            }
          }
          if (fieldSet.size > 0) fields[c.name] = Array.from(fieldSet);
        } catch { /* best-effort */ }
      })
    );

    return NextResponse.json({ collections, fields });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
