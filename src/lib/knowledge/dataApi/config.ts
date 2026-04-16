import type * as astra from "@/lib/astra";
import type { BackendConnectionState } from "@/lib/backends/types";
import type { KnowledgeBackendConfig } from "@/lib/knowledge/types";

export type DataApiDb = ReturnType<typeof astra.getAstraDb>;

export type DataApiKnowledgeConfig = BackendConnectionState;

export type LegacyDataApiKnowledgeConfig =
  | (Omit<Extract<BackendConnectionState, { backend: "astra" }>, "backend"> & {
      kind: "astra";
    })
  | (Omit<Extract<BackendConnectionState, { backend: "hcd" }>, "backend"> & {
      kind: "hcd";
    });

export function normalizeDataApiKnowledgeConfig(
  config: KnowledgeBackendConfig | LegacyDataApiKnowledgeConfig,
  displayName: string
): DataApiKnowledgeConfig {
  if (!("backend" in config)) {
    if ("kind" in config && (config.kind === "astra" || config.kind === "hcd")) {
      return {
        ...config,
        backend: config.kind,
      } as DataApiKnowledgeConfig;
    }
    throw new Error(`${displayName} knowledge backend is not supported`);
  }

  if (config.backend === "astra") {
    if (!config.token || !config.endpoint) {
      throw new Error(`${displayName} knowledge backend requires a token and endpoint`);
    }
    return config;
  }

  if (!config.endpoint || !config.username || !config.password) {
    throw new Error(
      `${displayName} knowledge backend requires an endpoint, username, and password`
    );
  }
  return config;
}

export type CreateDataApiDb = (
  config: DataApiKnowledgeConfig,
  keyspace?: string
) => DataApiDb;
