import { resolveBackend } from "@/lib/ai/service";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import type { CollectionDescription } from "@/lib/ingest/types";
import {
  getBackendHint,
  getCollectionConfig,
  mapCollectionDescriptionToSource,
} from "@/lib/knowledge/dataApi/collectionConfig";
import {
  normalizeDataApiKnowledgeConfig,
  type CreateDataApiDb,
  type DataApiKnowledgeConfig,
} from "@/lib/knowledge/dataApi/config";

export async function resolveDataApiIngestContext(args: {
  config: DataApiKnowledgeConfig;
  collectionName: string;
  huggingfaceApiKey?: string;
  createDb: CreateDataApiDb;
  displayName: string;
}) {
  const { config, collectionName, huggingfaceApiKey, createDb, displayName } = args;
  const normalizedConfig = normalizeDataApiKnowledgeConfig(config, displayName);

  const db = createDb(normalizedConfig, normalizedConfig.keyspace);
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
  const collectionSource = collectionDescription
    ? mapCollectionDescriptionToSource(collectionDescription)
    : undefined;
  const collectionConfig = getCollectionConfig(collectionSource);
  const backend = collectionConfig.useVectorize
    ? null
    : resolveBackend({ huggingfaceApiKey });
  const backendHint = getBackendHint(collectionSource, backend);

  return {
    db,
    collection,
    collectionDescription,
    collectionSource,
    collectionConfig,
    backend,
    backendHint,
  };
}
