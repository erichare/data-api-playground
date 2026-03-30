import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    token?: string;
    endpoint?: string;
    keyspace?: string;
    name: string;
    dimension: number;
    metric: string;
    provider: string;
    model: string;
  };
  const { token, endpoint, keyspace } = resolveAstraConnection(body, { includeDefaultKeyspace: true });
  const { name, dimension, metric, provider, model } = body;

  if (!token || !endpoint || !name) {
    return NextResponse.json({ error: "token, endpoint, and name are required" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);

    const hasVectorize = provider !== "none";

    await db.createCollection(name, {
      vector: {
        dimension,
        metric: metric as "cosine" | "dot_product" | "euclidean",
        ...(hasVectorize
          ? { service: { provider, modelName: model } }
          : {}),
      },
    });

    return NextResponse.json({
      collection: {
        name,
        count: 0,
        vectorDim: dimension,
        vectorizeService: hasVectorize ? { provider, modelName: model } : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
