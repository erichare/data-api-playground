import * as astra from "@/lib/astra";
import type { BackendConnectionState } from "@/lib/backends/types";
import {
  createAstraEmbeddingProviders,
  createAstraListKeyspaces,
  createDataApiBackend,
} from "@/lib/dataApi/factory";

function createDb(config: BackendConnectionState, keyspace = config.keyspace) {
  if (config.backend !== "astra") {
    throw new Error("Invalid backend for the Data API adapter");
  }
  if (!config.token || !config.endpoint) {
    throw new Error("Missing Data API token or endpoint");
  }
  const endpointValidator = Object.prototype.hasOwnProperty.call(
    astra,
    "isAllowedAstraEndpoint"
  )
    ? (astra as { isAllowedAstraEndpoint?: (endpoint: string) => boolean })
      .isAllowedAstraEndpoint
    : undefined;
  if (typeof endpointValidator === "function" && !endpointValidator(config.endpoint)) {
    throw new Error("Endpoint must be a valid Data API endpoint");
  }
  return keyspace == null
    ? astra.getAstraDb(config.token, config.endpoint)
    : astra.getAstraDb(config.token, config.endpoint, keyspace);
}

export const astraDataApiBackend = createDataApiBackend({
  kind: "astra",
  displayName: "Astra DB",
  capabilities: {
    connect: true,
    keyspaces: true,
    collectionCrud: true,
    embeddingProviders: true,
    vectorizeCollections: true,
    rawBrowse: true,
    deleteDocuments: true,
    apiProxy: true,
  },
  createDb,
  listKeyspaces: createAstraListKeyspaces(createDb),
  listEmbeddingProviders: createAstraEmbeddingProviders(createDb),
});
