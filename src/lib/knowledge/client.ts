import type { DataApiBackendKind } from "@/lib/backends/types";
import type {
  KnowledgeBackendMode,
  OpenragKnowledgeState,
} from "@/lib/knowledge/types";

export function buildKnowledgeRequestBody(args: {
  selectedBackend: DataApiBackendKind;
  knowledgeBackendMode: KnowledgeBackendMode;
  openragConnection?: OpenragKnowledgeState | null;
}) {
  const { selectedBackend, knowledgeBackendMode, openragConnection } = args;

  if (knowledgeBackendMode !== "openrag") {
    void selectedBackend;
    return {};
  }

  return {
    knowledgeBackend: "openrag" as const,
    ...(openragConnection?.fromEnv
      ? {}
      : {
          openragApiKey: openragConnection?.apiKey ?? "",
          openragBaseUrl: openragConnection?.baseUrl ?? "",
        }),
  };
}

export function appendKnowledgeFormData(
  formData: FormData,
  args: {
    selectedBackend: DataApiBackendKind;
    knowledgeBackendMode: KnowledgeBackendMode;
    openragConnection?: OpenragKnowledgeState | null;
  }
) {
  const payload = buildKnowledgeRequestBody(args);
  for (const [key, value] of Object.entries(payload)) {
    if (value == null || value === "") {
      continue;
    }
    formData.append(key, String(value));
  }
}
