import { getHcdDb } from "@/lib/hcd";
import type { BackendConnectionState } from "@/lib/backends/types";
import {
  createDataApiBackend,
  createNonAstraListKeyspaces,
} from "@/lib/dataApi/factory";

function createDb(config: BackendConnectionState, keyspace = config.keyspace) {
  if (config.backend !== "hcd") {
    throw new Error("Invalid backend for HCD data API adapter");
  }
  if (!config.endpoint || !config.username || !config.password) {
    throw new Error("Missing HCD endpoint, username, or password");
  }
  return getHcdDb(config.username, config.password, config.endpoint, keyspace);
}

export const hcdDataApiBackend = createDataApiBackend({
  kind: "hcd",
  displayName: "DataStax HCD",
  capabilities: {
    connect: true,
    keyspaces: true,
    collectionCrud: true,
    embeddingProviders: false,
    vectorizeCollections: false,
    rawBrowse: true,
    deleteDocuments: true,
    apiProxy: true,
  },
  createDb,
  listKeyspaces: createNonAstraListKeyspaces(createDb, "hcd"),
});
