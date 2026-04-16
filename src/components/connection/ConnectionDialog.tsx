"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plug,
  PlugZap,
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
import type { AiStatus } from "@/lib/ai/types";
import type {
  KnowledgeBackendMode,
  KnowledgeBackendStatuses,
  OpenragKnowledgeState,
} from "@/lib/knowledge/types";

export type { AiStatus } from "@/lib/ai/types";

type ConnectionDialogSection = "data" | "knowledge" | "ai";

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

export function getBackendSummary(connection: BackendConnectionState | null) {
  if (!connection) {
    return "Managed by server environment";
  }

  if (connection.backend === "astra") {
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

  if (
    knowledgeBackendMode === "openrag" &&
    !openragApiKey.trim() &&
    !openragStatus?.hasApiKey
  ) {
    return false;
  }

  if (selectedBackend === "astra") {
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
    useState<ConnectionDialogSection>(
      knowledgeBackendMode === "openrag" ? "knowledge" : "data"
    );
  const [astraToken, setAstraToken] = useState("");
  const [astraEndpoint, setAstraEndpoint] = useState("");
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

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftSelectedBackend(selectedBackend);
    setDraftKnowledgeBackendMode(knowledgeBackendMode);
    setActiveSection(knowledgeBackendMode === "openrag" ? "knowledge" : "data");

    if (currentConnection?.backend === "astra") {
      setAstraToken(currentConnection.token);
      setAstraEndpoint(currentConnection.endpoint);
    } else {
      setAstraToken("");
      setAstraEndpoint("");
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

    void fetch("/api/ai-status")
      .then((response) => response.json() as Promise<AiStatus>)
      .then((status) => setAiStatus(status))
      .catch(() => {
        setAiStatus(null);
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

  const currentBackendStatus =
    draftSelectedBackend === "hcd" ? backendStatuses?.hcd : backendStatuses?.astra;
  const trimmedHuggingFaceKey = huggingfaceApiKey.trim();
  const trimmedOpenragApiKey = openragApiKey.trim();
  const trimmedOpenragBaseUrl = openragBaseUrl.trim();

  const canConnect = useMemo(() => {
    return canConnectToBackend({
      selectedBackend: draftSelectedBackend,
      loading,
      currentBackendStatus,
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
    astraEndpoint,
    astraToken,
    currentBackendStatus,
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

  const resetDraftState = () => {
    setDraftSelectedBackend(selectedBackend);
    setDraftKnowledgeBackendMode(knowledgeBackendMode);
    setActiveSection(knowledgeBackendMode === "openrag" ? "knowledge" : "data");
    setAstraToken(currentConnection?.backend === "astra" ? currentConnection.token : "");
    setAstraEndpoint(
      currentConnection?.backend === "astra" ? currentConnection.endpoint : ""
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
      onHuggingfaceApiKeyChange(trimmedHuggingFaceKey);
      const connection =
        draftSelectedBackend === "astra"
          ? {
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
    draftSelectedBackend === "hcd" ? "HCD Password" : "Astra DB Application Token";
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
    draftSelectedBackend === "hcd" ? "HCD Endpoint" : "Astra DB API Endpoint";
  const knowledgeBackendLabel =
    draftKnowledgeBackendMode === "openrag"
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
              className="w-full max-w-md rounded-2xl flex flex-col"
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
                      ? `${getBackendDisplayName(draftSelectedBackend)} Connected`
                      : "Connections"}
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
                <div className="grid grid-cols-3 gap-2">
                  {([
                    {
                      key: "data" as const,
                      label: "Data",
                      description: getBackendDisplayName(draftSelectedBackend),
                    },
                    {
                      key: "knowledge" as const,
                      label: "Knowledge",
                      description: knowledgeBackendLabel,
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
                {activeSection === "data" ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label style={labelStyle}>Data Backend</label>
                      <p
                        className="text-[11px] mb-2 leading-relaxed"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Collections, raw browsing, and the API explorer stay on the connected Data API backend.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {(["astra", "hcd"] as const).map((backend) => {
                        const active = draftSelectedBackend === backend;
                        return (
                          <button
                            key={backend}
                            type="button"
                            onClick={() => {
                              setDraftSelectedBackend(backend);
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
                              {getBackendConnectionLabel(backend)}
                            </div>
                            <div
                              className="text-sm font-semibold mt-1"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {getBackendDisplayName(backend)}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {connected && (
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

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label style={{ ...labelStyle, marginBottom: 0 }}>
                          {endpointLabel}
                        </label>
                        {currentBackendStatus?.hasEndpoint && !endpointValue && (
                          <span
                            className="flex items-center gap-1 text-[10px]"
                            style={{ color: "#22c55e" }}
                          >
                            <CheckCircle2 size={10} /> Set via environment
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={endpointValue}
                        onChange={(event) => setEndpointValue(event.target.value)}
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
                          {currentBackendStatus?.hasUsername && !hcdUsername && (
                            <span
                              className="flex items-center gap-1 text-[10px]"
                              style={{ color: "#22c55e" }}
                            >
                              <CheckCircle2 size={10} /> Set via environment
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={hcdUsername}
                            onChange={(event) => setHcdUsername(event.target.value)}
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
                          onChange={(event) => setSecretValue(event.target.value)}
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
                          {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <p
                        className="text-[11px] mt-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Stored in session memory only. Leave blank to use environment-backed credentials when available.
                      </p>
                    </div>
                  </div>
                ) : activeSection === "knowledge" ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label style={labelStyle}>Knowledge Backend</label>
                      <p
                        className="text-[11px] mb-2 leading-relaxed"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Chat and document ingest can either stay on the connected backend or switch to OpenRAG.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {([
                        {
                          mode: "connected" as const,
                          label: getBackendDisplayName(draftSelectedBackend),
                          description: "Connected backend",
                        },
                        {
                          mode: "openrag" as const,
                          label: "OpenRAG",
                          description: "Knowledge service",
                        },
                      ]).map((option) => {
                        const active = draftKnowledgeBackendMode === option.mode;
                        return (
                          <button
                            key={option.mode}
                            type="button"
                            onClick={() => setDraftKnowledgeBackendMode(option.mode)}
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

                    {draftKnowledgeBackendMode === "openrag" && (
                      <>
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
