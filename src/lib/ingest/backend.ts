import {
  resolveBackend,
  type ResolvedAiBackend,
} from "@/lib/ai/service";
import { getAstraDb } from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import type {
  CollectionDescription,
  IngestBackendHint,
} from "@/lib/ingest/types";

/**
 * Inspect a collection description to determine if it uses server-side vectorize.
 * @returns Configuration including whether vectorize is enabled, vector dimensions, and provider info.
 */
export function getCollectionConfig(description: CollectionDescription | undefined) {
  const vectorDef = description?.definition?.vector;
  const service = vectorDef?.service ?? null;

  return {
    useVectorize: !!service,
    vectorDimension: vectorDef?.dimension ?? null,
    vectorizeProvider: service?.provider ?? "astra",
    vectorizeModel: service?.modelName ?? "server-side vectorize",
  };
}

/** Report which provider/model will be used for embedding during ingestion. */
export function getBackendHint(
  description: CollectionDescription | undefined,
  backend: ResolvedAiBackend | null
): IngestBackendHint {
  const config = getCollectionConfig(description);

  if (config.useVectorize) {
    return {
      provider: config.vectorizeProvider,
      model: config.vectorizeModel,
    };
  }

  if (!backend) {
    return {
      provider: "unknown",
      model: "unknown",
    };
  }

  return {
    provider: backend.provider,
    model: backend.embedModel,
  };
}

/**
 * Assert that embedding dimensions match the collection's expected vector size.
 * @throws If the dimensions don't match.
 */
export function validateVectorDimension(args: {
  collection: string;
  expected: number | null;
  embeddings: number[][];
}) {
  const { collection, expected, embeddings } = args;
  if (!expected || embeddings.length === 0) return;

  const actual = embeddings[0]?.length ?? 0;
  if (actual !== expected) {
    throw new Error(
      `Embedding dimension mismatch for "${collection}": collection expects ${expected}d but active model returned ${actual}d`
    );
  }
}

/**
 * Resolve the full ingestion context for a collection: Astra DB handle,
 * collection config (vectorize vs client-side embedding), AI backend, and
 * a human-readable hint about which provider/model will be used.
 */
export async function resolveIngestCollectionContext(args: {
  token: string;
  endpoint: string;
  keyspace?: string;
  collectionName: string;
  huggingfaceApiKey?: string;
}) {
  const { token, endpoint, keyspace, collectionName, huggingfaceApiKey } = args;
  const db = getAstraDb(token, endpoint, keyspace);
  const collection = db.collection(collectionName);

  recordAstraClientCall({
    label: "Inspect Collection Config",
    code: buildTsCall("db", [
      formatTsMethodCall("listCollections", [{ nameOnly: false }]),
    ]),
  });
  const collectionDescriptions = (await db.listCollections({
    nameOnly: false,
  })) as CollectionDescription[];
  const collectionDescription = collectionDescriptions.find(
    (candidate) => candidate.name === collectionName
  );
  const collectionConfig = getCollectionConfig(collectionDescription);
  const backend = collectionConfig.useVectorize
    ? null
    : resolveBackend({ huggingfaceApiKey });
  const backendHint = getBackendHint(collectionDescription, backend);

  return {
    db,
    collection,
    collectionDescription,
    collectionConfig,
    backend,
    backendHint,
  };
}
