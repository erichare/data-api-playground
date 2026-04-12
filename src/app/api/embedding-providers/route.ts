import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
  withRequestLog,
} from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { embeddingProvidersBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export interface ProviderModel {
  provider: string;
  providerDisplayName: string;
  modelName: string;
  vectorDimension: number | null;
}

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/embedding-providers");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, embeddingProvidersBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint, keyspace } = resolveAstraConnection(result);

  if (!token || !endpoint) {
    return NextResponse.json({ error: "token and endpoint are required" }, { status: 400 });
  }

  return withRequestLog(async () => {
    try {
      const db = getAstraDb(token, endpoint, keyspace);
      recordAstraClientCall({
        label: "List Embedding Providers",
        code: buildTsCall("db.admin()", [
          formatTsMethodCall("findEmbeddingProviders", []),
        ]),
      });
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
      logError(logContext, "embedding-providers.failed", err);
      return NextResponse.json(
        { error: sanitizeErrorForClient(err, "Failed to list providers") },
        { status: 500 }
      );
    }
  });
}
