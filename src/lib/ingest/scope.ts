import { normalizeEndpoint, type KnowledgeBackendKind } from "@/lib/backends/types";
import { resolveKnowledgeBackendConfig } from "@/lib/knowledge";
import type {
  KnowledgeBackendConfig,
  KnowledgeBackendInput,
} from "@/lib/knowledge/types";

export interface IngestedDocumentScope {
  backendKind: KnowledgeBackendKind;
  backendScope: string;
}

export function getIngestedDocumentScope(
  config: KnowledgeBackendConfig
): IngestedDocumentScope {
  if ("backend" in config) {
    return {
      backendKind: config.backend,
      backendScope: `${config.backend}:${normalizeEndpoint(config.endpoint)}:${config.keyspace ?? ""}`,
    };
  }

  return {
    backendKind: config.kind,
    backendScope: `${config.kind}:${normalizeEndpoint(config.baseUrl)}`,
  };
}

export function resolveIngestedDocumentScope(
  input: KnowledgeBackendInput,
  options?: { includeDefaultKeyspace?: boolean }
) {
  return getIngestedDocumentScope(resolveKnowledgeBackendConfig(input, options));
}
