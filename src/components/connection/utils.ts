import type {
  BackendConnectionState,
  BackendStatuses,
  DataApiBackendKind,
} from "@/lib/backends/types";
import type { AstraCliStatus } from "@/lib/astraCli";
import type { AiStatus } from "@/lib/ai/types";
import type { AstraConfigMode } from "@/lib/config/portableConfig";
import type {
  KnowledgeBackendMode,
  KnowledgeBackendStatuses,
} from "@/lib/knowledge/types";

export type ConnectionDialogSection = "backend" | "ai";
export type BackendOption = DataApiBackendKind | "openrag";

export interface DataApiConfigResponse {
  astraCli: AstraCliStatus;
}

export function shouldDefaultToAstraCli(status: AstraCliStatus | null | undefined) {
  return Boolean(
    status?.available &&
      status.configured &&
      status.selectedProfile &&
      status.databases.length > 0
  );
}

export function getAstraConfigMode(connection: BackendConnectionState | null) {
  return connection?.backend === "astra" && connection.fromAstraCli
    ? ("astra-cli" as const)
    : ("credentials" as const);
}

export function readFileText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read config file."));
    reader.readAsText(file);
  });
}

export function getBackendSummary(connection: BackendConnectionState | null) {
  if (!connection) {
    return "Managed by server environment";
  }

  if (connection.backend === "astra") {
    if (connection.fromAstraCli) {
      const database = connection.astraCliDatabase || "selected database";
      const profile = connection.astraCliProfile ? ` · ${connection.astraCliProfile}` : "";
      return `Astra CLI · ${database}${profile}`;
    }

    return connection.token
      ? `${connection.token.slice(0, 8)}••••••••••••••••${connection.token.slice(-4)}`
      : "Managed by server environment";
  }

  return connection.username
    ? `${connection.username} @ ${connection.endpoint || "env endpoint"}`
    : "Managed by server environment";
}

export function canConnectToBackend({
  selectedBackend,
  loading,
  currentBackendStatus,
  astraConfigMode,
  astraCliStatus,
  astraCliProfile,
  astraCliDatabase,
  knowledgeBackendMode = "connected",
  openragStatus,
  astraToken,
  astraEndpoint,
  hcdEndpoint,
  hcdUsername,
  hcdPassword,
  openragApiKey = "",
}: {
  selectedBackend: DataApiBackendKind;
  loading: boolean;
  currentBackendStatus:
    | BackendStatuses["astra"]
    | BackendStatuses["hcd"]
    | null
    | undefined;
  astraConfigMode: AstraConfigMode;
  astraCliStatus: AstraCliStatus | null;
  astraCliProfile: string;
  astraCliDatabase: string;
  knowledgeBackendMode: KnowledgeBackendMode;
  openragStatus: KnowledgeBackendStatuses["openrag"] | null | undefined;
  astraToken: string;
  astraEndpoint: string;
  hcdEndpoint: string;
  hcdUsername: string;
  hcdPassword: string;
  openragApiKey: string;
}) {
  if (loading) {
    return false;
  }

  if (knowledgeBackendMode === "openrag") {
    return Boolean(openragApiKey.trim() || openragStatus?.hasApiKey);
  }

  if (selectedBackend === "astra") {
    if (astraConfigMode === "astra-cli") {
      const effectiveProfile =
        astraCliProfile.trim() || astraCliStatus?.selectedProfile || "";
      return Boolean(
        astraCliStatus?.available &&
        astraCliStatus?.configured &&
        effectiveProfile &&
        astraCliDatabase.trim()
      );
    }

    return (
      (Boolean(astraToken.trim()) || Boolean(currentBackendStatus?.hasToken)) &&
      (Boolean(astraEndpoint.trim()) || Boolean(currentBackendStatus?.hasEndpoint))
    );
  }

  return (
    (Boolean(hcdEndpoint.trim()) || Boolean(currentBackendStatus?.hasEndpoint)) &&
    (Boolean(hcdUsername.trim()) || Boolean(currentBackendStatus?.hasUsername)) &&
    (Boolean(hcdPassword.trim()) || Boolean(currentBackendStatus?.hasPassword))
  );
}

export function getActiveAiSummary(
  aiStatus: AiStatus | null,
  huggingfaceApiKey: string
) {
  const trimmedHuggingFaceKey = huggingfaceApiKey.trim();

  if (trimmedHuggingFaceKey) {
    return {
      label: "Hugging Face via manual key",
      tone: "rgba(34,197,94,0.08)",
      border: "rgba(34,197,94,0.2)",
      accent: "#22c55e",
      detail: "Sent only to this app's server routes and kept in memory for this page session.",
    };
  }

  if (aiStatus?.hasHuggingFaceEnvKey) {
    return {
      label: "Hugging Face via env",
      tone: "rgba(34,197,94,0.08)",
      border: "rgba(34,197,94,0.2)",
      accent: "#22c55e",
      detail: "Using server-side Hugging Face credentials from the current environment.",
    };
  }

  if (!aiStatus) {
    return {
      label: "Ollama local fallback",
      tone: "rgba(251,191,36,0.08)",
      border: "rgba(251,191,36,0.2)",
      accent: "#f59e0b",
      detail: "Checking local Ollama status...",
    };
  }

  if (!aiStatus.ollamaReachable) {
    return {
      label: "Ollama local fallback",
      tone: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.2)",
      accent: "#ef4444",
      detail: `Ollama is not reachable at ${aiStatus.ollamaBaseUrl}. Start Ollama locally or provide a Hugging Face key.`,
    };
  }

  const missingModels = [
    !aiStatus.chatModelInstalled ? aiStatus.ollamaChatModel : null,
    !aiStatus.embedModelInstalled ? aiStatus.ollamaEmbedModel : null,
  ].filter(Boolean) as string[];

  if (missingModels.length > 0) {
    return {
      label: "Ollama local fallback",
      tone: "rgba(251,191,36,0.08)",
      border: "rgba(251,191,36,0.2)",
      accent: "#f59e0b",
      detail: `Missing local models: ${missingModels.join(", ")}. First run can take several GB and a few minutes while Ollama downloads them.`,
    };
  }

  return {
    label: "Ollama local fallback",
    tone: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.2)",
    accent: "#60a5fa",
    detail: `Ready locally at ${aiStatus.ollamaBaseUrl} using ${aiStatus.ollamaChatModel} and ${aiStatus.ollamaEmbedModel}.`,
  };
}

function isModelSizeSuffix(value: string) {
  if (value.length < 2) {
    return false;
  }

  const unit = value.at(-1)?.toLowerCase();
  if (unit !== "b" && unit !== "m") {
    return false;
  }

  let seenDigit = false;
  let seenDot = false;
  for (let index = 0; index < value.length - 1; index += 1) {
    const charCode = value.charCodeAt(index);
    if (charCode === 46) {
      if (seenDot || !seenDigit) {
        return false;
      }
      seenDot = true;
      continue;
    }
    if (charCode < 48 || charCode > 57) {
      return false;
    }
    seenDigit = true;
  }

  return seenDigit;
}

export function getModelFamilyLabel(model: string | null | undefined) {
  if (!model) {
    return "Checking...";
  }

  let compact = model.trim();

  const slashIndex = compact.lastIndexOf("/");
  if (slashIndex >= 0) {
    compact = compact.slice(slashIndex + 1);
  }

  compact = compact.replace(/:.+$/, "");
  compact = compact.replace(/-(Instruct|Chat|Base)$/i, "");
  const sizeSuffixIndex = compact.lastIndexOf("-");
  if (sizeSuffixIndex >= 0) {
    const sizeSuffix = compact.slice(sizeSuffixIndex + 1);
    if (isModelSizeSuffix(sizeSuffix)) {
      compact = compact.slice(0, sizeSuffixIndex);
    }
  }

  return compact || model.trim();
}

export function getActiveModelConfig(
  aiStatus: AiStatus | null,
  huggingfaceApiKey: string
) {
  const trimmedHuggingFaceKey = huggingfaceApiKey.trim();

  if (!aiStatus) {
    return {
      providerLabel: trimmedHuggingFaceKey ? "Hugging Face" : "Checking status",
      sourceLabel: trimmedHuggingFaceKey ? "Manual key" : "Waiting for server status",
      chatModel: null,
      embedModel: null,
    };
  }

  if (trimmedHuggingFaceKey) {
    return {
      providerLabel: "Hugging Face",
      sourceLabel: "Manual key",
      chatModel: aiStatus.huggingfaceChatModel,
      embedModel: aiStatus.huggingfaceEmbedModel,
    };
  }

  if (aiStatus.hasHuggingFaceEnvKey) {
    return {
      providerLabel: "Hugging Face",
      sourceLabel: "Environment",
      chatModel: aiStatus.huggingfaceChatModel,
      embedModel: aiStatus.huggingfaceEmbedModel,
    };
  }

  return {
    providerLabel: "Ollama",
    sourceLabel: "Local fallback",
    chatModel: aiStatus.ollamaChatModel,
    embedModel: aiStatus.ollamaEmbedModel,
  };
}
