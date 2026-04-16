import {
  getBackendHint,
  getCollectionConfig,
  resolveAstraIngestContext,
  validateVectorDimension,
} from "@/lib/knowledge/astraBackend";
import { resolveHcdIngestContext } from "@/lib/knowledge/hcdBackend";
import { resolveKnowledgeBackend } from "@/lib/knowledge";

export { getBackendHint, getCollectionConfig, validateVectorDimension };

/**
 * Resolve the ingestion context for the active knowledge backend while preserving
 * the existing Astra-based payload contract used by the ingest routes.
 */
export async function resolveIngestCollectionContext(args: {
  backend?: "astra" | "hcd";
  token: string;
  endpoint: string;
  username?: string;
  password?: string;
  keyspace?: string;
  collectionName: string;
  huggingfaceApiKey?: string;
}) {
  const { config, backend } = resolveKnowledgeBackend(
    {
      backend: args.backend,
      token: args.token,
      endpoint: args.endpoint,
      username: args.username,
      password: args.password,
      keyspace: args.keyspace,
    },
    { includeDefaultKeyspace: true }
  );

  if (!("backend" in config)) {
    throw new Error(`Knowledge backend "${backend.kind}" is not supported for ingest`);
  }

  switch (config.backend) {
    case "astra":
      return resolveAstraIngestContext({
        config,
        collectionName: args.collectionName,
        huggingfaceApiKey: args.huggingfaceApiKey,
      });
    case "hcd":
      return resolveHcdIngestContext({
        config,
        collectionName: args.collectionName,
        huggingfaceApiKey: args.huggingfaceApiKey,
      });
    default:
      throw new Error(`Knowledge backend "${backend.kind}" is not implemented`);
  }
}
