import { NextRequest, NextResponse } from "next/server";
import { withRequestLog } from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { resolveDataApiBackend } from "@/lib/dataApi";
import { getDataApiErrorStatus, toLegacyAstraCredentialMessage } from "@/lib/dataApi/errors";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { embeddingProvidersBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

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

  return withRequestLog(async () => {
    try {
      const { config, backend } = resolveDataApiBackend(result, {
        includeDefaultKeyspace: true,
      });
      const models = await backend.listEmbeddingProviders(config);

      return NextResponse.json({ models });
    } catch (err) {
      logError(logContext, "embedding-providers.failed", err, {
        backend: result.backend,
      });
      const rawMessage = sanitizeErrorForClient(err, "Failed to list providers");
      const message = toLegacyAstraCredentialMessage(rawMessage);
      return NextResponse.json(
        { error: message },
        { status: getDataApiErrorStatus(rawMessage, 500) }
      );
    }
  });
}
