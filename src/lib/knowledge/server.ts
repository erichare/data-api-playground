import type { KnowledgeBackendStatuses } from "@/lib/knowledge/types";

export function getKnowledgeBackendStatuses(): KnowledgeBackendStatuses {
  return {
    openrag: {
      kind: "openrag",
      ready: Boolean(process.env.OPENRAG_API_KEY),
      hasApiKey: Boolean(process.env.OPENRAG_API_KEY),
      hasBaseUrl: Boolean(process.env.OPENRAG_URL),
    },
  };
}
