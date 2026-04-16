import * as astra from "@/lib/astra";
import type { BackendConnectionState } from "@/lib/backends/types";
import {
  createDataApiKnowledgeBackend,
} from "@/lib/knowledge/dataApi/factory";
import type { CreateDataApiDb } from "@/lib/knowledge/dataApi/config";
import { resolveDataApiIngestContext } from "@/lib/knowledge/dataApi/ingestContext";

export {
  docPreview,
  getBackendHint,
  getCollectionConfig,
  validateVectorDimension,
} from "@/lib/knowledge/dataApi/collectionConfig";
export { sanitizeFilterField } from "@/lib/knowledge/dataApi/filters";
export { resolveDataApiIngestContext } from "@/lib/knowledge/dataApi/ingestContext";
export { createDataApiKnowledgeBackend } from "@/lib/knowledge/dataApi/factory";

function getOptionalAstraEndpointValidator() {
  return Object.prototype.hasOwnProperty.call(astra, "isAllowedAstraEndpoint")
    ? (astra as { isAllowedAstraEndpoint?: (endpoint: string) => boolean })
      .isAllowedAstraEndpoint
    : undefined;
}

const createAstraDb: CreateDataApiDb = (config, keyspace = config.keyspace) => {
  if (config.backend !== "astra") {
    throw new Error("Invalid backend for Astra knowledge adapter");
  }
  if (!config.token || !config.endpoint) {
    throw new Error("Missing Data API token or endpoint");
  }
  const endpointValidator = getOptionalAstraEndpointValidator();
  if (typeof endpointValidator === "function" && !endpointValidator(config.endpoint)) {
    throw new Error("Endpoint must be a valid Data API endpoint");
  }
  return keyspace == null
    ? astra.getAstraDb(config.token, config.endpoint)
    : astra.getAstraDb(config.token, config.endpoint, keyspace);
};

export const astraKnowledgeBackend = createDataApiKnowledgeBackend({
  kind: "astra",
  displayName: "Astra",
  createDb: createAstraDb,
});

export function resolveAstraIngestContext(args: {
  config: BackendConnectionState;
  collectionName: string;
  huggingfaceApiKey?: string;
}) {
  return resolveDataApiIngestContext({
    ...args,
    displayName: "Astra",
    createDb: createAstraDb,
  });
}
