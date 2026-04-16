import { astraKnowledgeBackend } from "@/lib/knowledge/astraBackend";
import { hcdKnowledgeBackend } from "@/lib/knowledge/hcdBackend";
import { openragKnowledgeBackend } from "@/lib/knowledge/openragBackend";
import type {
  KnowledgeBackend,
  KnowledgeBackendConfig,
  KnowledgeBackendInput,
  OpenragKnowledgeState,
} from "@/lib/knowledge/types";
import { resolveBackendConnection } from "@/lib/backends/server";
import {
  normalizeEndpoint,
  type DataApiBackendKind,
} from "@/lib/backends/types";

export { astraKnowledgeBackend } from "@/lib/knowledge/astraBackend";
export { hcdKnowledgeBackend } from "@/lib/knowledge/hcdBackend";
export { openragKnowledgeBackend } from "@/lib/knowledge/openragBackend";
export * from "@/lib/knowledge/client";
export type * from "@/lib/knowledge/types";

const OPENRAG_DEFAULT_URL = "http://localhost:3000";

function resolveOpenragKnowledgeConfig(
  input: KnowledgeBackendInput
): OpenragKnowledgeState {
  const apiKey = input.openragApiKey || process.env.OPENRAG_API_KEY || "";
  const baseUrl = normalizeEndpoint(
    input.openragBaseUrl || process.env.OPENRAG_URL || OPENRAG_DEFAULT_URL
  );

  return {
    kind: "openrag",
    apiKey,
    baseUrl,
    fromEnv: !input.openragApiKey && !input.openragBaseUrl,
  };
}

export function resolveKnowledgeBackendConfig(
  input: KnowledgeBackendInput,
  options?: { includeDefaultKeyspace?: boolean }
): KnowledgeBackendConfig {
  if (input.knowledgeBackend === "openrag") {
    return resolveOpenragKnowledgeConfig(input);
  }
  return resolveBackendConnection(input, options);
}

export function getKnowledgeBackend(kind: DataApiBackendKind | "openrag"): KnowledgeBackend {
  switch (kind) {
    case "openrag":
      return openragKnowledgeBackend;
    case "hcd":
      return hcdKnowledgeBackend;
    case "astra":
      return astraKnowledgeBackend;
  }
}

export function resolveKnowledgeBackend(
  input: KnowledgeBackendInput,
  options?: { includeDefaultKeyspace?: boolean }
) {
  const config = resolveKnowledgeBackendConfig(input, options);
  if ("backend" in config) {
    const backend = getKnowledgeBackend(config.backend);
    return {
      config,
      backend,
      capabilities: backend.capabilities,
    };
  }

  const backend = getKnowledgeBackend(config.kind);
  return {
    config,
    backend,
    capabilities: backend.capabilities,
  };
}
