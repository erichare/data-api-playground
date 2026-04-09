"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Eye,
  EyeOff,
  Plug,
  PlugZap,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Cpu,
  KeyRound,
} from "lucide-react";

type AiStatus = {
  hasHuggingFaceEnvKey: boolean;
  ollamaReachable: boolean;
  ollamaBaseUrl: string;
  chatModelInstalled: boolean;
  embedModelInstalled: boolean;
  chatModel: string;
  embedModel: string;
};

interface AstraConnectDialogProps {
  open: boolean;
  onClose: () => void;
  onConnect: (token: string, endpoint: string) => Promise<void>;
  onDisconnect: () => void;
  connected: boolean;
  currentToken: string;
  currentEndpoint: string;
  currentHuggingfaceApiKey?: string;
  onHuggingfaceApiKeyChange: (key: string) => void;
  error?: string;
}

export function AstraConnectDialog({
  open,
  onClose,
  onConnect,
  onDisconnect,
  connected,
  currentToken,
  currentEndpoint,
  currentHuggingfaceApiKey,
  onHuggingfaceApiKeyChange,
  error,
}: AstraConnectDialogProps) {
  const [token, setToken] = useState(currentToken);
  const [endpoint, setEndpoint] = useState(currentEndpoint);
  const [huggingfaceApiKey, setHuggingfaceApiKey] = useState(
    currentHuggingfaceApiKey ?? ""
  );
  const [showToken, setShowToken] = useState(false);
  const [showHuggingfaceApiKey, setShowHuggingfaceApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [envAstra, setEnvAstra] = useState<{
    hasToken: boolean;
    hasEndpoint: boolean;
  } | null>(null);
  const isConnected = connected;

  useEffect(() => {
    if (!open) return;

    setToken(currentToken);
    setEndpoint(currentEndpoint);
    setHuggingfaceApiKey(currentHuggingfaceApiKey ?? "");
    setShowToken(false);
    setShowHuggingfaceApiKey(false);

    Promise.all([
      fetch("/api/ai-status").then((response) => response.json() as Promise<AiStatus>),
      fetch("/api/astra-status").then(
        (response) =>
          response.json() as Promise<{ hasToken: boolean; hasEndpoint: boolean }>
      ),
    ])
      .then(([ai, astra]) => {
        setAiStatus(ai);
        setEnvAstra(astra);
      })
      .catch(() => {
        setAiStatus(null);
        setEnvAstra({ hasToken: false, hasEndpoint: false });
      });
  }, [open, currentToken, currentEndpoint, currentHuggingfaceApiKey]);

  const trimmedHuggingFaceKey = huggingfaceApiKey.trim();
  const canConnect =
    (!!token.trim() || !!envAstra?.hasToken) &&
    (!!endpoint.trim() || !!envAstra?.hasEndpoint) &&
    !loading;

  const activeAiSummary = useMemo(() => {
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
      !aiStatus.chatModelInstalled ? aiStatus.chatModel : null,
      !aiStatus.embedModelInstalled ? aiStatus.embedModel : null,
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
      detail: `Ready locally at ${aiStatus.ollamaBaseUrl} using ${aiStatus.chatModel} and ${aiStatus.embedModel}.`,
    };
  }, [aiStatus, trimmedHuggingFaceKey]);

  const handleConnect = async () => {
    if (!canConnect) return;
    setLoading(true);
    try {
      onHuggingfaceApiKeyChange(trimmedHuggingFaceKey);
      await onConnect(token.trim(), endpoint.trim());
      onClose();
    } catch {
      // Error displayed via props.error
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    onDisconnect();
    setToken("");
    setEndpoint("");
    onClose();
  };

  const maskedToken = currentToken
    ? currentToken.slice(0, 8) + "••••••••••••••••" + currentToken.slice(-4)
    : "Managed by server environment";

  const inputStyle: React.CSSProperties = {
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

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
    marginBottom: "6px",
    display: "block",
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
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
              className="w-full max-w-md rounded-2xl flex flex-col"
              style={{
                backgroundColor: "var(--bg-panel)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
                pointerEvents: "auto",
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
                      backgroundColor: isConnected
                        ? "rgba(34,197,94,0.1)"
                        : "var(--bg-hover)",
                      border: `1px solid ${
                        isConnected
                          ? "rgba(34,197,94,0.3)"
                          : "var(--border-subtle)"
                      }`,
                    }}
                  >
                    {isConnected ? (
                      <PlugZap size={14} style={{ color: "#22c55e" }} />
                    ) : (
                      <Plug size={14} style={{ color: "var(--text-muted)" }} />
                    )}
                  </div>
                  <h2
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {isConnected ? "Astra DB Connected" : "Connect to Astra DB"}
                  </h2>
                </div>
                <motion.button
                  onClick={onClose}
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

              <div className="flex flex-col gap-4 px-5 py-5">
                {isConnected && (
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
                        Active token
                      </span>
                      <span
                        className="text-[12px]"
                        style={{
                          color: "#22c55e",
                          fontFamily: "IBM Plex Mono, monospace",
                        }}
                      >
                        {maskedToken}
                      </span>
                    </div>
                  </div>
                )}

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
                        AI Backend
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

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label style={{ ...labelStyle, marginBottom: 0 }}>
                      Astra DB Application Token
                    </label>
                    {envAstra?.hasToken && !token && (
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
                      type={showToken ? "text" : "password"}
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      data-testid="astra-token-input"
                      placeholder="AstraCS:••••••••••••"
                      style={{ ...inputStyle, paddingRight: "40px" }}
                      onKeyDown={(event) =>
                        event.key === "Enter" && void handleConnect()
                      }
                      autoFocus={!isConnected}
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      data-bwignore="true"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p
                    className="text-[11px] mt-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Find in Astra DB console → Token Management. Stored in session
                    memory only.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label style={{ ...labelStyle, marginBottom: 0 }}>
                      Astra DB Endpoint
                    </label>
                    {envAstra?.hasEndpoint && !endpoint && (
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
                    value={endpoint}
                    onChange={(event) => setEndpoint(event.target.value)}
                    data-testid="astra-endpoint-input"
                    placeholder="https://xxxx-xxxx.apps.astra.datastax.com"
                    style={inputStyle}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <div
                  style={{
                    borderTop: "1px solid var(--border-subtle)",
                    margin: "0 -4px",
                  }}
                />

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
                    Optional. When omitted, the app falls back to local Ollama for
                    chat and embeddings.
                  </p>
                </div>
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
                {isConnected ? (
                  <motion.button
                    onClick={handleDisconnect}
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
                    onClick={onClose}
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
                    data-testid="astra-connect-submit"
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
                    {isConnected ? "Reconnect" : "Connect"}
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
