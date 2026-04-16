"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Download,
  Loader2,
  Plug,
  PlugZap,
  Upload,
  X,
} from "lucide-react";
import type {
  BackendConnectionState,
  BackendStatuses,
  DataApiBackendKind,
} from "@/lib/backends/types";
import { getBackendDisplayName, getBackendConnectionLabel } from "@/lib/backends/types";
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
import { AstraCliForm } from "@/components/connection/AstraCliForm";
import { CredentialsForm } from "@/components/connection/CredentialsForm";
import { ModelsSection } from "@/components/connection/ModelsSection";
import { OpenragForm } from "@/components/connection/OpenragForm";
import {
  canConnectToBackend,
  getActiveModelConfig,
  getAstraConfigMode,
  getBackendSummary,
  getModelFamilyLabel,
  readFileText,
  shouldDefaultToAstraCli,
  type BackendOption,
  type ConnectionDialogSection,
  type DataApiConfigResponse,
} from "@/components/connection/utils";
import { labelStyle } from "@/components/connection/styles";

export type { AiStatus } from "@/lib/ai/types";
export {
  canConnectToBackend,
  getActiveAiSummary,
  getBackendSummary,
  getModelFamilyLabel,
} from "@/components/connection/utils";

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
  const trimmedHuggingFaceKey = huggingfaceApiKey.trim();
  const trimmedOpenragApiKey = openragApiKey.trim();
  const trimmedOpenragBaseUrl = openragBaseUrl.trim();

  const canConnect = useMemo(() => {
    return canConnectToBackend({
      selectedBackend: draftSelectedBackend,
      loading,
      currentBackendStatus,
      astraConfigMode,
      astraCliStatus,
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
    astraCliStatus,
    astraConfigMode,
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

  const activeModelConfig = useMemo(() => {
    return getActiveModelConfig(aiStatus, trimmedHuggingFaceKey);
  }, [aiStatus, trimmedHuggingFaceKey]);
  const activeModelTabLabel = useMemo(() => {
    if (!activeModelConfig.chatModel) {
      return activeModelConfig.providerLabel;
    }
    return getModelFamilyLabel(activeModelConfig.chatModel);
  }, [activeModelConfig]);

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

  const draftBackendOption: BackendOption =
    draftKnowledgeBackendMode === "openrag" ? "openrag" : draftSelectedBackend;
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
                        connected ? "rgba(34,197,94,0.3)" : "var(--border-subtle)"
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
                  {[
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
                  ].map((section) => {
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
                      {(["astra", "hcd", "openrag"] as const).map((backend) => {
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
                      <OpenragForm
                        apiKey={openragApiKey}
                        setApiKey={setOpenragApiKey}
                        baseUrl={openragBaseUrl}
                        setBaseUrl={setOpenragBaseUrl}
                        showApiKey={showOpenragApiKey}
                        setShowApiKey={setShowOpenragApiKey}
                        knowledgeStatuses={knowledgeStatuses}
                      />
                    ) : (
                      <>
                        {connected && currentConnection && (
                          <ActiveConnectionPill connection={currentConnection} />
                        )}

                        {draftSelectedBackend === "astra" &&
                        astraCliStatus?.available &&
                        astraCliStatus.configured ? (
                          <AstraConfigSourcePicker
                            mode={astraConfigMode}
                            onModeChange={(next) => {
                              astraConfigModeLockedRef.current = true;
                              setAstraConfigMode(next);
                            }}
                          />
                        ) : null}

                        {draftSelectedBackend === "astra" &&
                        astraConfigMode === "astra-cli" ? (
                          <AstraCliForm
                            astraCliStatus={astraCliStatus}
                            astraCliProfile={astraCliProfile}
                            setAstraCliProfile={setAstraCliProfile}
                            astraCliDatabase={astraCliDatabase}
                            setAstraCliDatabase={setAstraCliDatabase}
                          />
                        ) : (
                          <CredentialsForm
                            draftSelectedBackend={draftSelectedBackend}
                            currentBackendStatus={currentBackendStatus}
                            astraToken={astraToken}
                            setAstraToken={setAstraToken}
                            astraEndpoint={astraEndpoint}
                            setAstraEndpoint={setAstraEndpoint}
                            hcdEndpoint={hcdEndpoint}
                            setHcdEndpoint={setHcdEndpoint}
                            hcdUsername={hcdUsername}
                            setHcdUsername={setHcdUsername}
                            hcdPassword={hcdPassword}
                            setHcdPassword={setHcdPassword}
                            showSecret={showSecret}
                            setShowSecret={setShowSecret}
                          />
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <ModelsSection
                    aiStatus={aiStatus}
                    huggingfaceApiKey={huggingfaceApiKey}
                    setHuggingfaceApiKey={setHuggingfaceApiKey}
                    showHuggingfaceApiKey={showHuggingfaceApiKey}
                    setShowHuggingfaceApiKey={setShowHuggingfaceApiKey}
                    onHuggingfaceApiKeyChange={onHuggingfaceApiKeyChange}
                  />
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

function ActiveConnectionPill({ connection }: { connection: BackendConnectionState }) {
  const summary = getBackendSummary(connection);

  return (
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
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Active connection
        </span>
        <span
          className="text-[12px]"
          style={{
            color: "#22c55e",
            fontFamily: "IBM Plex Mono, monospace",
          }}
        >
          {summary}
        </span>
      </div>
    </div>
  );
}

interface AstraConfigSourcePickerProps {
  mode: AstraConfigMode;
  onModeChange: (mode: AstraConfigMode) => void;
}

function AstraConfigSourcePicker({ mode, onModeChange }: AstraConfigSourcePickerProps) {
  const options: Array<{ key: AstraConfigMode; label: string; description: string }> = [
    {
      key: "credentials",
      label: "Credentials",
      description: "Manual or environment-backed",
    },
    {
      key: "astra-cli",
      label: "Astra CLI",
      description: "Reuse a local CLI profile",
    },
  ];

  return (
    <div>
      <label style={labelStyle}>Data API Config Source</label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const active = mode === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onModeChange(option.key)}
              className="rounded-xl px-3 py-2.5 text-left"
              style={{
                backgroundColor: active ? "var(--interactive-light)" : "var(--bg-card)",
                border: `1px solid ${
                  active ? "var(--interactive-border)" : "var(--border-subtle)"
                }`,
              }}
            >
              <div
                className="text-[10px] uppercase tracking-widest font-semibold"
                style={{
                  color: active ? "var(--interactive)" : "var(--text-muted)",
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
  );
}
