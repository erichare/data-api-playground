import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import { requireApiAuth } from "@/lib/auth";

export interface ProviderModel {
  provider: string;
  providerDisplayName: string;
  modelName: string;
  vectorDimension: number | null;
}

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
    const { embeddingProviders } = await db.admin().findEmbeddingProviders();

    const models: ProviderModel[] = [];
    for (const [providerId, info] of Object.entries(embeddingProviders)) {
      for (const model of info.models) {
        models.push({
          provider: providerId,
          providerDisplayName: info.displayName,
          modelName: model.name,
          vectorDimension: model.vectorDimension,
        });
      }
    }

    return NextResponse.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
