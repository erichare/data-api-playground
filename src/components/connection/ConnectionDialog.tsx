"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plug,
  PlugZap,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import type {
  BackendConnectionState,
  BackendStatuses,
  DataApiBackendKind,
} from "@/lib/backends/types";
import {
  getBackendConnectionLabel,
  getBackendDisplayName,
} from "@/lib/backends/types";
import type { AstraCliStatus } from "@/lib/astraCli";
import type { AiStatus } from "@/lib/ai/types";
import {
  DEFAULT_PORTABLE_CONFIG_FILENAME,
  parsePortablePlaygroundConfig,
  stringifyPortablePlaygroundConfig,
  type AstraConfigMode,
} from "@/lib/config/portableConfig";
import type {
  KnowledgeBackendMode,
  KnowledgeBackendStatuses,
  OpenragKnowledgeState,
} from "@/lib/knowledge/types";

export type { AiStatus } from "@/lib/ai/types";

type ConnectionDialogSection = "backend" | "ai";
type BackendOption = DataApiBackendKind | "openrag";

interface ConnectionDialogProps {
  open: boolean;
  onClose: () => void;
  onConnect: (connection: BackendConnectionState) => Promise<void>;
  onDisconnect: () => void;
  connected: boolean;
  selectedBackend: DataApiBackendKind;
  onSelectedBackendChange: (backend: DataApiBackendKind) => void;
  knowledgeBackendMode: KnowledgeBackendMode;
  onKnowledgeBackendModeChange: (mode: KnowledgeBackendMode) => void;
  currentOpenragConnection: OpenragKnowledgeState | null;
  onOpenragConnectionChange: (connection: OpenragKnowledgeState | null) => void;
  currentConnection: BackendConnectionState | null;
  backendStatuses: BackendStatuses | null;
  currentHuggingfaceApiKey?: string;
  onHuggingfaceApiKeyChange: (key: string) => void;
  error?: string;
}

interface DataApiConfigResponse {
  astraCli: AstraCliStatus;
}

function shouldDefaultToAstraCli(status: AstraCliStatus | null | undefined) {
  return Boolean(
    status?.available &&
      status.configured &&
      status.selectedProfile &&
      status.databases.length > 0
  );
}

function getAstraConfigMode(connection: BackendConnectionState | null) {
  return connection?.backend === "astra" && connection.fromAstraCli
    ? ("astra-cli" as const)
    : ("credentials" as const);
}

function readFileText(file: File) {
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

function getActiveModelConfig(
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

export function ConnectionDialog({
  open,
  onClose,
  onConnect,
  onDisconnect,
  connected,
  selectedBackend,
  onSelectedBackendChange,
  knowledgeBackendMode = "connected",
  onKnowledgeBackendModeChange = () => undefined,
  currentOpenragConnection = null,
  onOpenragConnectionChange = () => undefined,
  currentConnection,
  backendStatuses,
  currentHuggingfaceApiKey,
  onHuggingfaceApiKeyChange,
  error,
}: ConnectionDialogProps) {
  const [draftSelectedBackend, setDraftSelectedBackend] =
    useState<DataApiBackendKind>(selectedBackend);
  const [draftKnowledgeBackendMode, setDraftKnowledgeBackendMode] =
    useState<KnowledgeBackendMode>(knowledgeBackendMode);
  const [activeSection, setActiveSection] =
    useState<ConnectionDialogSection>("backend");
  const [astraConfigMode, setAstraConfigMode] = useState<AstraConfigMode>(
    getAstraConfigMode(currentConnection)
  );
  const [astraToken, setAstraToken] = useState("");
  const [astraEndpoint, setAstraEndpoint] = useState("");
  const [astraCliProfile, setAstraCliProfile] = useState("");
  const [astraCliDatabase, setAstraCliDatabase] = useState("");
  const [hcdEndpoint, setHcdEndpoint] = useState("");
  const [hcdUsername, setHcdUsername] = useState("");
  const [hcdPassword, setHcdPassword] = useState("");
  const [openragApiKey, setOpenragApiKey] = useState("");
  const [openragBaseUrl, setOpenragBaseUrl] = useState("");
  const [huggingfaceApiKey, setHuggingfaceApiKey] = useState(
    currentHuggingfaceApiKey ?? ""
  );
  const [showSecret, setShowSecret] = useState(false);
  const [showOpenragApiKey, setShowOpenragApiKey] = useState(false);
  const [showHuggingfaceApiKey, setShowHuggingfaceApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [knowledgeStatuses, setKnowledgeStatuses] =
    useState<KnowledgeBackendStatuses | null>(null);
  const [dataApiConfigStatus, setDataApiConfigStatus] =
    useState<DataApiConfigResponse | null>(null);
  const [configNotice, setConfigNotice] = useState("");
  const [configNoticeTone, setConfigNoticeTone] = useState<"error" | "success">(
    "success"
  );
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const astraConfigModeLockedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftSelectedBackend(selectedBackend);
    setDraftKnowledgeBackendMode(knowledgeBackendMode);
    setActiveSection("backend");
    setAstraConfigMode(getAstraConfigMode(currentConnection));

    if (currentConnection?.backend === "astra") {
      setAstraToken(currentConnection.token);
      setAstraEndpoint(currentConnection.endpoint);
      setAstraCliProfile(currentConnection.astraCliProfile ?? "");
      setAstraCliDatabase(currentConnection.astraCliDatabase ?? "");
    } else {
      setAstraToken("");
      setAstraEndpoint("");
      setAstraCliProfile("");
      setAstraCliDatabase("");
    }

    if (currentConnection?.backend === "hcd") {
      setHcdEndpoint(currentConnection.endpoint);
      setHcdUsername(currentConnection.username);
      setHcdPassword(currentConnection.password);
    } else {
      setHcdEndpoint("");
      setHcdUsername("");
      setHcdPassword("");
    }

    if (currentOpenragConnection?.kind === "openrag") {
      setOpenragApiKey(currentOpenragConnection.apiKey);
      setOpenragBaseUrl(currentOpenragConnection.baseUrl);
    } else {
      setOpenragApiKey("");
      setOpenragBaseUrl("");
    }

    setHuggingfaceApiKey(currentHuggingfaceApiKey ?? "");
    setShowSecret(false);
    setShowOpenragApiKey(false);
    setShowHuggingfaceApiKey(false);
    setConfigNotice("");
    astraConfigModeLockedRef.current = false;

    void fetch("/api/ai-status")
      .then((response) => response.json() as Promise<AiStatus>)
      .then((status) => setAiStatus(status))
      .catch(() => {
        setAiStatus(null);
      });
    void fetch(
      currentConnection?.backend === "astra" && currentConnection.astraCliProfile
        ? `/api/data-api-config?profile=${encodeURIComponent(
            currentConnection.astraCliProfile
          )}`
        : "/api/data-api-config"
    )
      .then((response) => response.json() as Promise<DataApiConfigResponse>)
      .then((status) => setDataApiConfigStatus(status))
      .catch(() => {
        setDataApiConfigStatus(null);
      });
    void fetch("/api/knowledge-backend-status")
      .then((response) => response.json() as Promise<KnowledgeBackendStatuses>)
      .then((status) => setKnowledgeStatuses(status))
      .catch(() => {
        setKnowledgeStatuses(null);
      });
  }, [
    currentConnection,
    currentHuggingfaceApiKey,
    currentOpenragConnection,
    knowledgeBackendMode,
    open,
    selectedBackend,
  ]);

  useEffect(() => {
    if (
      !open ||
      draftSelectedBackend !== "astra" ||
      astraConfigMode !== "astra-cli" ||
      !astraCliProfile.trim()
    ) {
      return;
    }

    void fetch(`/api/data-api-config?profile=${encodeURIComponent(astraCliProfile.trim())}`)
      .then((response) => response.json() as Promise<DataApiConfigResponse>)
      .then((status) => setDataApiConfigStatus(status))
      .catch(() => {
        setDataApiConfigStatus(null);
      });
  }, [astraCliProfile, astraConfigMode, draftSelectedBackend, open]);

  useEffect(() => {
    if (!open || draftSelectedBackend !== "astra") {
      return;
    }

    const selectedProfile = dataApiConfigStatus?.astraCli.selectedProfile ?? "";
    if (!astraCliProfile && selectedProfile) {
      setAstraCliProfile(selectedProfile);
    }

    const databases = dataApiConfigStatus?.astraCli.databases ?? [];
    if (
      astraCliDatabase &&
      !databases.some((database) => database.id === astraCliDatabase)
    ) {
      setAstraCliDatabase("");
    }

    if (!astraCliDatabase && databases.length === 1) {
      setAstraCliDatabase(databases[0].id);
    }
  }, [
    astraCliDatabase,
    astraCliProfile,
    dataApiConfigStatus,
    draftSelectedBackend,
    open,
  ]);

  useEffect(() => {
    if (
      !open ||
      draftSelectedBackend !== "astra" ||
      draftKnowledgeBackendMode === "openrag" ||
      astraConfigMode !== "credentials" ||
      astraConfigModeLockedRef.current ||
      currentConnection?.backend === "astra" ||
      Boolean(astraToken.trim()) ||
      Boolean(astraEndpoint.trim()) ||
      !shouldDefaultToAstraCli(dataApiConfigStatus?.astraCli ?? null)
    ) {
      return;
    }

    astraConfigModeLockedRef.current = true;
    setAstraConfigMode("astra-cli");
  }, [
    astraConfigMode,
    astraEndpoint,
    astraToken,
    currentConnection,
    dataApiConfigStatus?.astraCli,
    draftKnowledgeBackendMode,
    draftSelectedBackend,
    open,
  ]);

  const currentBackendStatus =
    draftSelectedBackend === "hcd" ? backendStatuses?.hcd : backendStatuses?.astra;
  const astraCliStatus = dataApiConfigStatus?.astraCli ?? null;
  const astraCliDatabases = astraCliStatus?.databases ?? [];
  const selectedAstraCliDatabase =
    astraCliDatabases.find((database) => database.id === astraCliDatabase) ?? null;
  const trimmedHuggingFaceKey = huggingfaceApiKey.trim();
  const trimmedOpenragApiKey = openragApiKey.trim();
  const trimmedOpenragBaseUrl = openragBaseUrl.trim();

  const canConnect = useMemo(() => {
    return canConnectToBackend({
      selectedBackend: draftSelectedBackend,
      loading,
      currentBackendStatus,
      astraConfigMode,
      astraCliStatus: dataApiConfigStatus?.astraCli ?? null,
      astraCliProfile,
      astraCliDatabase,
      knowledgeBackendMode: draftKnowledgeBackendMode,
      openragStatus: knowledgeStatuses?.openrag,
      astraToken,
      astraEndpoint,
      hcdEndpoint,
      hcdUsername,
      hcdPassword,
      openragApiKey,
    });
  }, [
    astraCliDatabase,
    astraCliProfile,
    astraConfigMode,
    astraEndpoint,
    astraToken,
    currentBackendStatus,
    dataApiConfigStatus?.astraCli,
    hcdEndpoint,
    hcdPassword,
    hcdUsername,
    loading,
    draftKnowledgeBackendMode,
    draftSelectedBackend,
    knowledgeStatuses?.openrag,
    openragApiKey,
  ]);

  const activeAiSummary = useMemo(() => {
    return getActiveAiSummary(aiStatus, trimmedHuggingFaceKey);
  }, [aiStatus, trimmedHuggingFaceKey]);
  const activeModelConfig = useMemo(() => {
    return getActiveModelConfig(aiStatus, trimmedHuggingFaceKey);
  }, [aiStatus, trimmedHuggingFaceKey]);
  const activeModelTabLabel = useMemo(() => {
    if (!activeModelConfig.chatModel) {
      return activeModelConfig.providerLabel;
    }

    return getModelFamilyLabel(activeModelConfig.chatModel);
  }, [activeModelConfig]);

  const labelStyle: CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
    marginBottom: "6px",
    display: "block",
  };

  const inputStyle: CSSProperties = {
    backgroundColor: "var(--bg-input)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "13px",
    width: "100%",
    outline: "none",
    fontFamily: "IBM Plex Mono, monospace",
  };

  const setConfigFeedback = (message: string, tone: "error" | "success") => {
    setConfigNotice(message);
    setConfigNoticeTone(tone);
  };

  const handleConfigExport = () => {
    try {
      const yaml = stringifyPortablePlaygroundConfig({
        selectedBackend: draftSelectedBackend,
        astraConfigMode,
        astraToken,
        astraEndpoint,
        astraCliProfile,
        astraCliDatabase,
        hcdEndpoint,
        hcdUsername,
        hcdPassword,
        knowledgeBackendMode: draftKnowledgeBackendMode,
        openragApiKey,
        openragBaseUrl,
        huggingfaceApiKey,
        hasOpenragEnvApiKey: Boolean(knowledgeStatuses?.openrag?.hasApiKey),
        hasOpenragEnvBaseUrl: Boolean(knowledgeStatuses?.openrag?.hasBaseUrl),
        hasHuggingFaceEnvKey: Boolean(aiStatus?.hasHuggingFaceEnvKey),
      });
      const blob = new Blob([yaml], { type: "application/yaml;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = DEFAULT_PORTABLE_CONFIG_FILENAME;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setConfigFeedback("Config exported.", "success");
    } catch (error) {
      setConfigFeedback(
        error instanceof Error ? error.message : "Config export failed.",
        "error"
      );
    }
  };

  const handleConfigImportClick = () => {
    importInputRef.current?.click();
  };

  const handleConfigImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = parsePortablePlaygroundConfig(await readFileText(file));
      setDraftSelectedBackend(parsed.selectedBackend);
      setAstraConfigMode(parsed.astraConfigMode);
      setAstraToken(parsed.astraToken);
      setAstraEndpoint(parsed.astraEndpoint);
      setAstraCliProfile(parsed.astraCliProfile);
      setAstraCliDatabase(parsed.astraCliDatabase);
      setHcdEndpoint(parsed.hcdEndpoint);
      setHcdUsername(parsed.hcdUsername);
      setHcdPassword(parsed.hcdPassword);
      setDraftKnowledgeBackendMode(parsed.knowledgeBackendMode);
      setOpenragApiKey(parsed.openragApiKey);
      setOpenragBaseUrl(parsed.openragBaseUrl);
      setHuggingfaceApiKey(parsed.huggingfaceApiKey);
      setActiveSection("backend");
      astraConfigModeLockedRef.current = true;
      setConfigFeedback("Config imported. Review it, then connect.", "success");
    } catch (error) {
      setConfigFeedback(
        error instanceof Error ? error.message : "Config import failed.",
        "error"
      );
    } finally {
      event.target.value = "";
    }
  };

  const resetDraftState = () => {
    setDraftSelectedBackend(selectedBackend);
    setDraftKnowledgeBackendMode(knowledgeBackendMode);
    setActiveSection("backend");
    setAstraConfigMode(getAstraConfigMode(currentConnection));
    setAstraToken(currentConnection?.backend === "astra" ? currentConnection.token : "");
    setAstraEndpoint(
      currentConnection?.backend === "astra" ? currentConnection.endpoint : ""
    );
    setAstraCliProfile(
      currentConnection?.backend === "astra" ? (currentConnection.astraCliProfile ?? "") : ""
    );
    setAstraCliDatabase(
      currentConnection?.backend === "astra" ? (currentConnection.astraCliDatabase ?? "") : ""
    );
    setHcdEndpoint(currentConnection?.backend === "hcd" ? currentConnection.endpoint : "");
    setHcdUsername(currentConnection?.backend === "hcd" ? currentConnection.username : "");
    setHcdPassword(currentConnection?.backend === "hcd" ? currentConnection.password : "");
    setOpenragApiKey(currentOpenragConnection?.kind === "openrag" ? currentOpenragConnection.apiKey : "");
    setOpenragBaseUrl(
      currentOpenragConnection?.kind === "openrag" ? currentOpenragConnection.baseUrl : ""
    );
    setHuggingfaceApiKey(currentHuggingfaceApiKey ?? "");
    setShowSecret(false);
    setShowOpenragApiKey(false);
    setShowHuggingfaceApiKey(false);
    setConfigNotice("");
    astraConfigModeLockedRef.current = false;
  };

  const handleDialogClose = () => {
    resetDraftState();
    onClose();
  };

  const handleConnect = async () => {
    if (!canConnect) {
      return;
    }

    setLoading(true);
    try {
      setConfigNotice("");
      onHuggingfaceApiKeyChange(trimmedHuggingFaceKey);
      if (draftKnowledgeBackendMode !== "openrag") {
        const connection =
          draftSelectedBackend === "astra"
            ? astraConfigMode === "astra-cli"
              ? {
                  backend: "astra" as const,
                  token: "",
                  endpoint: "",
                  fromAstraCli: true,
                  astraCliProfile:
                    astraCliProfile.trim() ||
                    dataApiConfigStatus?.astraCli.selectedProfile ||
                    undefined,
                  astraCliDatabase: astraCliDatabase.trim(),
                }
              : {
                  backend: "astra" as const,
                  token: astraToken.trim(),
                  endpoint: astraEndpoint.trim(),
                  fromEnv: !astraToken.trim() && !astraEndpoint.trim(),
                }
            : {
                backend: "hcd" as const,
                endpoint: hcdEndpoint.trim(),
                username: hcdUsername.trim(),
                password: hcdPassword.trim(),
                fromEnv:
                  !hcdEndpoint.trim() && !hcdUsername.trim() && !hcdPassword.trim(),
              };
        await onConnect(connection);
      }
      onSelectedBackendChange(draftSelectedBackend);
      onKnowledgeBackendModeChange(draftKnowledgeBackendMode);
      onOpenragConnectionChange(
        trimmedOpenragApiKey ||
        trimmedOpenragBaseUrl ||
        knowledgeStatuses?.openrag?.hasApiKey
          ? {
              kind: "openrag",
              apiKey: trimmedOpenragApiKey,
              baseUrl: trimmedOpenragBaseUrl,
              fromEnv: !trimmedOpenragApiKey && !trimmedOpenragBaseUrl,
            }
          : null
      );
      onClose();
    } catch {
      // Error is surfaced by parent state.
    } finally {
      setLoading(false);
    }
  };

  const secretLabel =
    draftSelectedBackend === "hcd" ? "HCD Password" : "Data API Application Token";
  const secretValue = draftSelectedBackend === "hcd" ? hcdPassword : astraToken;
  const setSecretValue =
    draftSelectedBackend === "hcd" ? setHcdPassword : setAstraToken;
  const secretTestId =
    draftSelectedBackend === "hcd" ? "hcd-password-input" : "astra-token-input";
  const endpointValue =
    draftSelectedBackend === "hcd" ? hcdEndpoint : astraEndpoint;
  const setEndpointValue =
    draftSelectedBackend === "hcd" ? setHcdEndpoint : setAstraEndpoint;
  const endpointTestId =
    draftSelectedBackend === "hcd" ? "hcd-endpoint-input" : "astra-endpoint-input";
  const endpointLabel =
    draftSelectedBackend === "hcd" ? "HCD Endpoint" : "Data API Endpoint";
  const draftBackendOption: BackendOption =
    draftKnowledgeBackendMode === "openrag"
      ? "openrag"
      : draftSelectedBackend;
  const backendTabLabel =
    draftBackendOption === "openrag"
      ? "OpenRAG"
      : getBackendDisplayName(draftSelectedBackend);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDialogClose}
            className="fixed inset-0 z-40"
            style={{
              backgroundColor: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(3px)",
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ pointerEvents: "none" }}
          >
            <div
              data-testid="connect-dialog"
              className="w-full max-w-2xl rounded-2xl flex flex-col"
              style={{
                backgroundColor: "var(--bg-panel)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
                pointerEvents: "auto",
                maxHeight: "min(760px, calc(100vh - 2rem))",
              }}
            >
              <div
                className="flex items-center justify-between px-5 py-4 border-b shrink-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: connected
                        ? "rgba(34,197,94,0.1)"
                        : "var(--bg-hover)",
                      border: `1px solid ${
                        connected
                          ? "rgba(34,197,94,0.3)"
                          : "var(--border-subtle)"
                      }`,
                    }}
                  >
                    {connected ? (
                      <PlugZap size={14} style={{ color: "#22c55e" }} />
                    ) : (
                      <Plug size={14} style={{ color: "var(--text-muted)" }} />
                    )}
                  </div>
                  <h2
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {connected
                      ? `${
                          draftBackendOption === "openrag"
                            ? "OpenRAG"
                            : getBackendDisplayName(draftSelectedBackend)
                        } Connected`
                      : "Backend"}
                  </h2>
                </div>
                <motion.button
                  onClick={handleDialogClose}
                  className="p-1.5 rounded-lg"
                  style={{
                    color: "var(--text-muted)",
                    backgroundColor: "rgba(0,0,0,0)",
                  }}
                  whileHover={{
                    backgroundColor: "var(--bg-hover)",
                    color: "var(--text-primary)",
                  }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X size={14} />
                </motion.button>
              </div>

              <div
                className="px-5 pt-4 pb-3 border-b shrink-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="grid grid-cols-2 gap-2">
                  {([
                    {
                      key: "backend" as const,
                      label: "Backend",
                      description: backendTabLabel,
                    },
                    {
                      key: "ai" as const,
                      label: "Models",
                      description: activeModelTabLabel,
                    },
                  ]).map((section) => {
                    const active = activeSection === section.key;
                    return (
                      <button
                        key={section.key}
                        type="button"
                        data-testid={`connection-tab-${section.key}`}
                        onClick={() => setActiveSection(section.key)}
                        className="rounded-xl px-3 py-2.5 text-left"
                        style={{
                          backgroundColor: active
                            ? "var(--interactive-light)"
                            : "var(--bg-card)",
                          border: `1px solid ${
                            active
                              ? "var(--interactive-border)"
                              : "var(--border-subtle)"
                          }`,
                        }}
                        aria-pressed={active}
                      >
                        <div
                          className="text-[10px] uppercase tracking-widest font-semibold"
                          style={{
                            color: active
                              ? "var(--interactive)"
                              : "var(--text-muted)",
                          }}
                        >
                          {section.label}
                        </div>
                        <div
                          className="text-sm font-semibold mt-1"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {section.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {activeSection === "backend" ? (
                  <div className="flex flex-col gap-4">
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".yaml,.yml,.json,text/yaml,application/yaml,application/json"
                      onChange={(event) => void handleConfigImport(event)}
                      className="hidden"
                    />

                    <div>
                      <label style={labelStyle}>Backend</label>
                      <p
                        className="text-[11px] mb-2 leading-relaxed"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Choose where chat and document ingest should run. OpenRAG hides the collections sidebar and API explorer because they are specific to Data API and HCD.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleConfigImportClick}
                        className="rounded-lg px-3 py-2 text-[12px] font-medium flex items-center gap-2"
                        style={{
                          color: "var(--text-primary)",
                          backgroundColor: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <Upload size={13} />
                        Import config
                      </button>
                      <button
                        type="button"
                        onClick={handleConfigExport}
                        className="rounded-lg px-3 py-2 text-[12px] font-medium flex items-center gap-2"
                        style={{
                          color: "var(--text-primary)",
                          backgroundColor: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <Download size={13} />
                        Export config
                      </button>
                    </div>

                    {configNotice ? (
                      <div
                        className="rounded-lg px-3 py-2 text-[12px]"
                        style={{
                          color:
                            configNoticeTone === "error"
                              ? "#fecaca"
                              : "var(--text-primary)",
                          backgroundColor:
                            configNoticeTone === "error"
                              ? "rgba(239,68,68,0.08)"
                              : "rgba(59,130,246,0.08)",
                          border: `1px solid ${
                            configNoticeTone === "error"
                              ? "rgba(239,68,68,0.2)"
                              : "rgba(59,130,246,0.2)"
                          }`,
                        }}
                      >
                        {configNotice}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-3 gap-2">
                      {([
                        "astra",
                        "hcd",
                        "openrag",
                      ] as const).map((backend) => {
                        const active = draftBackendOption === backend;
                        const label = backend === "openrag" ? "Langflow" : "DataStax";
                        const description =
                          backend === "openrag"
                            ? "OpenRAG"
                            : getBackendConnectionLabel(backend);
                        return (
                          <button
                            key={backend}
                            type="button"
                            onClick={() => {
                              if (backend === "openrag") {
                                setDraftKnowledgeBackendMode("openrag");
                                return;
                              }

                              setDraftSelectedBackend(backend);
                              setDraftKnowledgeBackendMode("connected");
                              onSelectedBackendChange(backend);
                            }}
                            className="rounded-xl px-3 py-2.5 text-left"
                            style={{
                              backgroundColor: active
                                ? "var(--interactive-light)"
                                : "var(--bg-card)",
                              border: `1px solid ${
                                active
                                  ? "var(--interactive-border)"
                                  : "var(--border-subtle)"
                              }`,
                            }}
                          >
                            <div
                              className="text-[10px] uppercase tracking-widest font-semibold"
                              style={{
                                color: active
                                  ? "var(--interactive)"
                                  : "var(--text-muted)",
                              }}
                            >
                              {label}
                            </div>
                            <div
                              className="text-sm font-semibold mt-1"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {description}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {draftBackendOption === "openrag" ? (
                      <>
                        <div>
                          <label style={labelStyle}>OpenRAG Settings</label>
                          <p
                            className="text-[11px] mb-2 leading-relaxed"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Use OpenRAG for vector search and document ingestion. Hybrid search, lexical search, CSV ingest, the collections sidebar, and the API explorer stay disabled in this mode.
                          </p>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label style={{ ...labelStyle, marginBottom: 0 }}>
                              OpenRAG API Key
                            </label>
                            {knowledgeStatuses?.openrag?.hasApiKey && !trimmedOpenragApiKey ? (
                              <span
                                className="flex items-center gap-1 text-[10px]"
                                style={{ color: "#22c55e" }}
                              >
                                <CheckCircle2 size={10} /> Set via environment
                              </span>
                            ) : null}
                          </div>
                          <div className="relative">
                            <input
                              type={showOpenragApiKey ? "text" : "password"}
                              value={openragApiKey}
                              onChange={(event) => setOpenragApiKey(event.target.value)}
                              data-testid="openrag-api-key-input"
                              placeholder="orag_xxxxxxxxxxxxx"
                              style={{ ...inputStyle, paddingRight: "40px" }}
                              autoComplete="off"
                              data-1p-ignore
                              data-lpignore="true"
                              data-bwignore="true"
                              spellCheck={false}
                            />
                            <button
                              type="button"
                              onClick={() => setShowOpenragApiKey((value) => !value)}
                              className="absolute right-3 top-1/2 -translate-y-1/2"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {showOpenragApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label style={{ ...labelStyle, marginBottom: 0 }}>
                              OpenRAG URL
                            </label>
                            {knowledgeStatuses?.openrag?.hasBaseUrl && !trimmedOpenragBaseUrl ? (
                              <span
                                className="flex items-center gap-1 text-[10px]"
                                style={{ color: "#22c55e" }}
                              >
                                <CheckCircle2 size={10} /> Set via environment
                              </span>
                            ) : (
                              <span
                                className="text-[10px]"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Defaults to http://localhost:3000
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={openragBaseUrl}
                            onChange={(event) => setOpenragBaseUrl(event.target.value)}
                            data-testid="openrag-base-url-input"
                            placeholder="https://openrag.example.com"
                            style={inputStyle}
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <p
                            className="text-[11px] mt-1.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            OpenRAG uses semantic search and document ingestion. Hybrid, lexical, and CSV row ingest stay disabled for this backend.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        {connected && currentConnection && (
                          <div
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
                            style={{
                              backgroundColor: "rgba(34,197,94,0.06)",
                              border: "1px solid rgba(34,197,94,0.15)",
                            }}
                          >
                            <motion.div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: "#22c55e" }}
                              animate={{ opacity: [1, 0.4, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            />
                            <div className="flex flex-col min-w-0">
                              <span
                                className="text-[11px]"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Active connection
                              </span>
                              <span
                                className="text-[12px]"
                                style={{
                                  color: "#22c55e",
                                  fontFamily: "IBM Plex Mono, monospace",
                                }}
                              >
                                {getBackendSummary(currentConnection)}
                              </span>
                            </div>
                          </div>
                        )}

                        {draftSelectedBackend === "astra" &&
                        astraCliStatus?.available &&
                        astraCliStatus.configured ? (
                          <div>
                            <label style={labelStyle}>Data API Config Source</label>
                            <div className="grid grid-cols-2 gap-2">
                              {([
                                {
                                  key: "credentials" as const,
                                  label: "Credentials",
                                  description: "Manual or environment-backed",
                                },
                                {
                                  key: "astra-cli" as const,
                                  label: "Astra CLI",
                                  description: "Reuse a local CLI profile",
                                },
                              ]).map((option) => {
                                const active = astraConfigMode === option.key;
                                return (
                                  <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => {
                                      astraConfigModeLockedRef.current = true;
                                      setAstraConfigMode(option.key);
                                    }}
                                    className="rounded-xl px-3 py-2.5 text-left"
                                    style={{
                                      backgroundColor: active
                                        ? "var(--interactive-light)"
                                        : "var(--bg-card)",
                                      border: `1px solid ${
                                        active
                                          ? "var(--interactive-border)"
                                          : "var(--border-subtle)"
                                      }`,
                                    }}
                                  >
                                    <div
                                      className="text-[10px] uppercase tracking-widest font-semibold"
                                      style={{
                                        color: active
                                          ? "var(--interactive)"
                                          : "var(--text-muted)",
                                      }}
                                    >
                                      {option.label}
                                    </div>
                                    <div
                                      className="text-sm font-semibold mt-1"
                                      style={{ color: "var(--text-primary)" }}
                                    >
                                      {option.description}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {draftSelectedBackend === "astra" &&
                        astraConfigMode === "astra-cli" ? (
                          <div className="flex flex-col gap-4">
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label style={{ ...labelStyle, marginBottom: 0 }}>
                                  Astra CLI Profile
                                </label>
                                {astraCliStatus?.selectedProfile ? (
                                  <span
                                    className="text-[10px]"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    Default: {astraCliStatus.selectedProfile}
                                  </span>
                                ) : null}
                              </div>
                              <select
                                value={astraCliProfile}
                                onChange={(event) =>
                                  setAstraCliProfile(event.target.value)
                                }
                                data-testid="astra-cli-profile-select"
                                style={inputStyle}
                              >
                                <option value="">Choose a profile…</option>
                                {astraCliStatus?.profiles.map((profile) => (
                                  <option key={profile.name} value={profile.name}>
                                    {profile.name}
                                    {profile.isDefault ? " (default)" : ""}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label style={{ ...labelStyle, marginBottom: 0 }}>
                                  Astra CLI Database
                                </label>
                                {selectedAstraCliDatabase?.region ? (
                                  <span
                                    className="text-[10px]"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    {selectedAstraCliDatabase.region}
                                  </span>
                                ) : null}
                              </div>
                              <select
                                value={astraCliDatabase}
                                onChange={(event) =>
                                  setAstraCliDatabase(event.target.value)
                                }
                                data-testid="astra-cli-database-select"
                                style={inputStyle}
                              >
                                <option value="">Choose a database…</option>
                                {astraCliDatabases.map((database) => (
                                  <option key={database.id} value={database.id}>
                                    {database.name}
                                  </option>
                                ))}
                              </select>
                              <p
                                className="text-[11px] mt-1.5"
                                style={{ color: "var(--text-muted)" }}
                              >
                                The app resolves the token and endpoint from your
                                local `astra` setup only when this mode is selected.
                              </p>
                            </div>

                            {selectedAstraCliDatabase ? (
                              <div
                                className="rounded-xl px-3 py-2.5"
                                style={{
                                  backgroundColor: "var(--bg-card)",
                                  border: "1px solid var(--border-subtle)",
                                }}
                              >
                                <div
                                  className="text-[10px] uppercase tracking-widest font-semibold"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  Resolved Endpoint
                                </div>
                                <div
                                  className="text-[12px] mt-1"
                                  style={{
                                    color: "var(--text-primary)",
                                    fontFamily: "IBM Plex Mono, monospace",
                                    overflowWrap: "anywhere",
                                  }}
                                >
                                  {selectedAstraCliDatabase.endpoint}
                                </div>
                              </div>
                            ) : null}

                            {astraCliStatus?.error ? (
                              <div
                                className="rounded-lg px-3 py-2 text-[12px]"
                                style={{
                                  color: "#fecaca",
                                  backgroundColor: "rgba(239,68,68,0.08)",
                                  border: "1px solid rgba(239,68,68,0.2)",
                                }}
                              >
                                {astraCliStatus.error}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <>
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label style={{ ...labelStyle, marginBottom: 0 }}>
                                  {endpointLabel}
                                </label>
                                {currentBackendStatus?.hasEndpoint && !endpointValue ? (
                                  <span
                                    className="flex items-center gap-1 text-[10px]"
                                    style={{ color: "#22c55e" }}
                                  >
                                    <CheckCircle2 size={10} /> Set via environment
                                  </span>
                                ) : null}
                              </div>
                              <input
                                type="text"
                                value={endpointValue}
                                onChange={(event) =>
                                  setEndpointValue(event.target.value)
                                }
                                data-testid={endpointTestId}
                                placeholder={
                                  draftSelectedBackend === "hcd"
                                    ? "https://my-hcd-host:8181"
                                    : "https://xxxx-xxxx.apps.astra.datastax.com"
                                }
                                style={inputStyle}
                                autoComplete="off"
                                spellCheck={false}
                              />
                            </div>

                            {draftSelectedBackend === "hcd" && (
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                                    HCD Username
                                  </label>
                                  {currentBackendStatus?.hasUsername && !hcdUsername ? (
                                    <span
                                      className="flex items-center gap-1 text-[10px]"
                                      style={{ color: "#22c55e" }}
                                    >
                                      <CheckCircle2 size={10} /> Set via environment
                                    </span>
                                  ) : null}
                                </div>
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={hcdUsername}
                                    onChange={(event) =>
                                      setHcdUsername(event.target.value)
                                    }
                                    data-testid="hcd-username-input"
                                    placeholder="cassandra"
                                    style={{ ...inputStyle, paddingLeft: "36px" }}
                                    autoComplete="off"
                                    spellCheck={false}
                                  />
                                  <UserRound
                                    size={14}
                                    className="absolute left-3 top-1/2 -translate-y-1/2"
                                    style={{ color: "var(--text-muted)" }}
                                  />
                                </div>
                              </div>
                            )}

                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label style={{ ...labelStyle, marginBottom: 0 }}>
                                  {secretLabel}
                                </label>
                                {draftSelectedBackend === "astra" &&
                                currentBackendStatus?.hasToken &&
                                !astraToken ? (
                                  <span
                                    className="flex items-center gap-1 text-[10px]"
                                    style={{ color: "#22c55e" }}
                                  >
                                    <CheckCircle2 size={10} /> Set via environment
                                  </span>
                                ) : null}
                                {draftSelectedBackend === "hcd" &&
                                currentBackendStatus?.hasPassword &&
                                !hcdPassword ? (
                                  <span
                                    className="flex items-center gap-1 text-[10px]"
                                    style={{ color: "#22c55e" }}
                                  >
                                    <CheckCircle2 size={10} /> Set via environment
                                  </span>
                                ) : null}
                              </div>
                              <div className="relative">
                                <input
                                  type={showSecret ? "text" : "password"}
                                  value={secretValue}
                                  onChange={(event) =>
                                    setSecretValue(event.target.value)
                                  }
                                  data-testid={secretTestId}
                                  placeholder={
                                    draftSelectedBackend === "hcd"
                                      ? "••••••••"
                                      : "AstraCS:••••••••••••"
                                  }
                                  style={{ ...inputStyle, paddingRight: "40px" }}
                                  autoComplete="off"
                                  data-1p-ignore
                                  data-lpignore="true"
                                  data-bwignore="true"
                                  spellCheck={false}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowSecret((value) => !value)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {showSecret ? (
                                    <EyeOff size={14} />
                                  ) : (
                                    <Eye size={14} />
                                  )}
                                </button>
                              </div>
                              <p
                                className="text-[11px] mt-1.5"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Stored in session memory only. Leave blank to use
                                environment-backed credentials when available.
                              </p>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label style={labelStyle}>Models</label>
                      <p
                        className="text-[11px] mb-2 leading-relaxed"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Control the optional Hugging Face override and see which chat and embedding models new requests will use.
                      </p>
                    </div>

                    <div
                      className="px-3 py-3 rounded-xl"
                      style={{
                        backgroundColor: activeAiSummary.tone,
                        border: `1px solid ${activeAiSummary.border}`,
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: "rgba(255,255,255,0.04)",
                            color: activeAiSummary.accent,
                          }}
                        >
                          {trimmedHuggingFaceKey || aiStatus?.hasHuggingFaceEnvKey ? (
                            <KeyRound size={14} />
                          ) : (
                            <Cpu size={14} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div
                            className="text-[10px] font-semibold uppercase tracking-widest"
                            style={{ color: activeAiSummary.accent }}
                          >
                            Active Provider
                          </div>
                          <div
                            className="text-[13px] font-semibold mt-0.5"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {activeAiSummary.label}
                          </div>
                          <p
                            className="text-[11px] mt-1 leading-relaxed"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {activeAiSummary.detail}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {([
                        {
                          label: "Provider Source",
                          value: `${activeModelConfig.providerLabel} · ${activeModelConfig.sourceLabel}`,
                        },
                        {
                          label: "Chat Model",
                          value: activeModelConfig.chatModel ?? "Checking server config...",
                        },
                        {
                          label: "Embedding Model",
                          value:
                            activeModelConfig.embedModel ??
                            "Checking server config...",
                        },
                      ]).map((item) => (
                        <div
                          key={item.label}
                          className="rounded-xl px-3 py-2.5"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <div
                            className="text-[10px] uppercase tracking-widest font-semibold"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {item.label}
                          </div>
                          <div
                            className="text-[12px] mt-1"
                            style={{
                              color: "var(--text-primary)",
                              fontFamily: "IBM Plex Mono, monospace",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label style={{ ...labelStyle, marginBottom: 0 }}>
                          Hugging Face API Key
                        </label>
                        {trimmedHuggingFaceKey ? (
                          <span
                            className="flex items-center gap-1 text-[10px]"
                            style={{ color: "#22c55e" }}
                          >
                            <CheckCircle2 size={10} /> Will override env
                          </span>
                        ) : aiStatus?.hasHuggingFaceEnvKey ? (
                          <span
                            className="flex items-center gap-1 text-[10px]"
                            style={{ color: "#22c55e" }}
                          >
                            <CheckCircle2 size={10} /> Set via environment
                          </span>
                        ) : (
                          <span
                            className="text-[10px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Optional
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showHuggingfaceApiKey ? "text" : "password"}
                          value={huggingfaceApiKey}
                          onChange={(event) =>
                            setHuggingfaceApiKey(event.target.value)
                          }
                          onBlur={() =>
                            onHuggingfaceApiKeyChange(huggingfaceApiKey.trim())
                          }
                          data-testid="huggingface-api-key-input"
                          placeholder={
                            aiStatus?.hasHuggingFaceEnvKey
                              ? "Override environment key..."
                              : "hf_xxxxxxxxxxxxx"
                          }
                          style={{ ...inputStyle, paddingRight: "40px" }}
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-bwignore="true"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowHuggingfaceApiKey((value) => !value)
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {showHuggingfaceApiKey ? (
                            <EyeOff size={14} />
                          ) : (
                            <Eye size={14} />
                          )}
                        </button>
                      </div>
                      <p
                        className="text-[11px] mt-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Optional. When omitted, the app falls back to local Ollama for chat and embeddings.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div
                  className="mx-5 mb-1 flex items-start gap-2 px-3 py-2.5 rounded-lg"
                  style={{
                    backgroundColor: "rgba(239,68,68,0.07)",
                    border: "1px solid rgba(239,68,68,0.2)",
                  }}
                >
                  <AlertCircle
                    size={13}
                    style={{
                      color: "#ef4444",
                      marginTop: "1px",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    className="text-[12px] leading-relaxed"
                    style={{ color: "#fca5a5" }}
                  >
                    {error}
                  </span>
                </div>
              )}

              <div
                className="flex items-center justify-between gap-2 px-5 py-4 border-t shrink-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {connected ? (
                  <motion.button
                    onClick={() => {
                      onDisconnect();
                    handleDialogClose();
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{
                      color: "#ef4444",
                      backgroundColor: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.18)",
                    }}
                    whileHover={{ backgroundColor: "rgba(239,68,68,0.12)" }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Disconnect
                  </motion.button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={handleDialogClose}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{
                      color: "var(--text-muted)",
                      backgroundColor: "transparent",
                      border: "1px solid var(--border-subtle)",
                    }}
                    whileHover={{ backgroundColor: "var(--bg-hover)" }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    onClick={() => void handleConnect()}
                    disabled={!canConnect}
                    data-testid="backend-connect-submit"
                    className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                    style={{
                      color: canConnect ? "#fff" : "var(--text-muted)",
                      backgroundColor: canConnect
                        ? "var(--interactive)"
                        : "var(--bg-hover)",
                      border: "1px solid transparent",
                    }}
                    whileHover={canConnect ? { scale: 1.01 } : {}}
                    whileTap={canConnect ? { scale: 0.98 } : {}}
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    {connected ? "Reconnect" : "Connect"}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
