import { getHcdDb } from "@/lib/hcd";
import type { BackendConnectionState } from "@/lib/backends/types";
import {
  createDataApiKnowledgeBackend,
  resolveDataApiIngestContext,
} from "@/lib/knowledge/astraBackend";

export const hcdKnowledgeBackend = createDataApiKnowledgeBackend({
  kind: "hcd",
  displayName: "DataStax HCD",
  createDb(config, keyspace = config.keyspace) {
    if (config.backend !== "hcd") {
      throw new Error("Invalid backend for HCD knowledge adapter");
    }
    if (!config.endpoint || !config.username || !config.password) {
      throw new Error("Missing HCD endpoint, username, or password");
    }
    return getHcdDb(config.username, config.password, config.endpoint, keyspace);
  },
});

export function resolveHcdIngestContext(args: {
  config: BackendConnectionState;
  collectionName: string;
  huggingfaceApiKey?: string;
}) {
  return resolveDataApiIngestContext({
    ...args,
    displayName: "DataStax HCD",
    createDb(config, keyspace = config.keyspace) {
      if (config.backend !== "hcd") {
        throw new Error("Invalid backend for HCD knowledge adapter");
      }
      if (!config.endpoint || !config.username || !config.password) {
        throw new Error("Missing HCD endpoint, username, or password");
      }
      return getHcdDb(config.username, config.password, config.endpoint, keyspace);
    },
  });
}
