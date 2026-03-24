"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, EyeOff, Plug, PlugZap, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface AstraConnectDialogProps {
  open: boolean;
  onClose: () => void;
  onConnect: (token: string, endpoint: string) => Promise<void>;
  onDisconnect: () => void;
  currentToken: string;
  currentEndpoint: string;
  currentIbmApiKey: string;
  currentWatsonxProjectId: string;
  onIbmApiKeyChange: (key: string) => void;
  onWatsonxProjectIdChange: (id: string) => void;
  error?: string;
}

export function AstraConnectDialog({
  open,
  onClose,
  onConnect,
  onDisconnect,
  currentToken,
  currentEndpoint,
  currentIbmApiKey,
  currentWatsonxProjectId,
  onIbmApiKeyChange,
  onWatsonxProjectIdChange,
  error,
}: AstraConnectDialogProps) {
  const [token, setToken] = useState(currentToken);
  const [endpoint, setEndpoint] = useState(currentEndpoint);
  const [ibmApiKey, setIbmApiKey] = useState(currentIbmApiKey);
  const [watsonxProjectId, setWatsonxProjectId] = useState(currentWatsonxProjectId);
  const [showToken, setShowToken] = useState(false);
  const [showIbmApiKey, setShowIbmApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [envHasKey, setEnvHasKey] = useState<boolean | null>(null);
  const [envHasProjectId, setEnvHasProjectId] = useState<boolean | null>(null);
  const [envAstra, setEnvAstra] = useState<{ hasToken: boolean; hasEndpoint: boolean } | null>(null);
  const isConnected = !!currentToken;

  // Sync when dialog opens
  useEffect(() => {
    if (open) {
      setToken(currentToken);
      setEndpoint(currentEndpoint);
      setIbmApiKey(currentIbmApiKey);
      setWatsonxProjectId(currentWatsonxProjectId);
      setShowToken(false);
      setShowIbmApiKey(false);
      // Check env key status
      // Parallelize both status checks
      Promise.all([
        fetch("/api/watsonx-status").then((r) => r.json() as Promise<{ hasKey: boolean; hasProjectId: boolean }>),
        fetch("/api/astra-status").then((r) => r.json() as Promise<{ hasToken: boolean; hasEndpoint: boolean }>),
      ]).then(([wx, astra]) => {
        setEnvHasKey(wx.hasKey);
        setEnvHasProjectId(wx.hasProjectId);
        setEnvAstra(astra);
      }).catch(() => {
        setEnvHasKey(false);
        setEnvHasProjectId(false);
        setEnvAstra({ hasToken: false, hasEndpoint: false });
      });
    }
  }, [open, currentToken, currentEndpoint, currentIbmApiKey, currentWatsonxProjectId]);

  const canConnect = (!!token.trim() || !!envAstra?.hasToken) && (!!endpoint.trim() || !!envAstra?.hasEndpoint) && !loading;

  const handleConnect = async () => {
    if (!canConnect) return;
    setLoading(true);
    try {
      onIbmApiKeyChange(ibmApiKey.trim());
      onWatsonxProjectIdChange(watsonxProjectId.trim());
      await onConnect(token.trim(), endpoint.trim());
      onClose();
    } catch {
      // error displayed via props.error
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

  const handleSaveIbmApiKey = () => {
    onIbmApiKeyChange(ibmApiKey.trim());
  };

  const inputStyle = {
    backgroundColor: "#0b0f1a",
    border: "1px solid #1e2d4a",
    color: "#f8fafc",
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "13px",
    width: "100%",
    outline: "none",
  };

  const labelStyle = {
    fontSize: "11px",
    fontWeight: 600 as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#64748b",
    marginBottom: "6px",
    display: "block",
  };

  const maskedToken = currentToken
    ? currentToken.slice(0, 8) + "••••••••••••••••" + currentToken.slice(-4)
    : "";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
          />

          {/* Dialog */}
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
                backgroundColor: "#0d1220",
                border: "1px solid #1e2d4a",
                boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
                pointerEvents: "auto",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "#1e2d4a" }}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{
                      background: isConnected
                        ? "linear-gradient(135deg, rgba(0,194,203,0.2), rgba(108,99,255,0.2))"
                        : "linear-gradient(135deg, rgba(100,116,139,0.2), rgba(30,45,74,0.4))",
                      border: `1px solid ${isConnected ? "rgba(0,194,203,0.3)" : "rgba(100,116,139,0.3)"}`,
                    }}
                  >
                    {isConnected
                      ? <PlugZap size={14} style={{ color: "#00c2cb" }} />
                      : <Plug size={14} style={{ color: "#64748b" }} />
                    }
                  </div>
                  <h2 className="text-sm font-semibold" style={{ color: "#f8fafc" }}>
                    {isConnected ? "Astra DB Connected" : "Connect to Astra DB"}
                  </h2>
                </div>
                <motion.button
                  onClick={onClose}
                  className="p-1.5 rounded-lg"
                  style={{ color: "#64748b" }}
                  whileHover={{ backgroundColor: "rgba(30,45,74,0.8)", color: "#f8fafc" }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X size={14} />
                </motion.button>
              </div>

              {/* Body */}
              <div className="flex flex-col gap-4 px-5 py-5">
                {isConnected && (
                  <div
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
                    style={{ backgroundColor: "rgba(0,194,203,0.06)", border: "1px solid rgba(0,194,203,0.15)" }}
                  >
                    <motion.div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: "#00c2cb" }}
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px]" style={{ color: "#64748b" }}>Active token</span>
                      <span className="text-[12px] font-mono" style={{ color: "#00c2cb" }}>{maskedToken}</span>
                    </div>
                  </div>
                )}

                {/* Token field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Astra DB Application Token</label>
                    {envAstra?.hasToken && !token && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: "#4ade80" }}>
                        <CheckCircle2 size={10} />
                        Set via environment
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showToken ? "text" : "password"}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="AstraCS:••••••••••••"
                      style={{ ...inputStyle, paddingRight: "40px" }}
                      onKeyDown={(e) => e.key === "Enter" && void handleConnect()}
                      autoFocus={!isConnected}
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      data-bwignore="true"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "#475569" }}
                    >
                      {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: "#475569" }}>
                    Find your token in the Astra DB console under "Token Management". Stored in session memory only — never persisted.
                  </p>
                </div>

                {/* Endpoint field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Astra DB Endpoint</label>
                    {envAstra?.hasEndpoint && !endpoint && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: "#4ade80" }}>
                        <CheckCircle2 size={10} />
                        Set via environment
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="https://xxxx-xxxx.apps.astra.datastax.com"
                    style={inputStyle}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                {/* Divider */}
                <div style={{ borderTop: "1px solid #1e2d4a", margin: "0 -4px" }} />

                {/* IBM Cloud API Key */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label style={{ ...labelStyle, marginBottom: 0 }}>watsonx API Key</label>
                    {envHasKey === true && !ibmApiKey && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: "#4ade80" }}>
                        <CheckCircle2 size={10} />
                        Set via environment
                      </span>
                    )}
                    {envHasKey === false && !ibmApiKey && (
                      <span className="text-[10px]" style={{ color: "#f87171" }}>Not set in environment</span>
                    )}
                    {ibmApiKey && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: "#4ade80" }}>
                        <CheckCircle2 size={10} />
                        Will override env
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showIbmApiKey ? "text" : "password"}
                      value={ibmApiKey}
                      onChange={(e) => setIbmApiKey(e.target.value)}
                      onBlur={handleSaveIbmApiKey}
                      placeholder={envHasKey ? "Override environment key…" : "••••••••••••••••"}
                      style={{ ...inputStyle, paddingRight: "40px" }}
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => setShowIbmApiKey((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "#475569" }}
                    >
                      {showIbmApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: "#475569" }}>
                    Your IBM Cloud API key for watsonx.ai. Found in IBM Cloud → Manage → Access (IAM) → API keys.
                  </p>
                </div>

                {/* watsonx Project ID */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label style={{ ...labelStyle, marginBottom: 0 }}>watsonx Project ID</label>
                    {envHasProjectId === true && !watsonxProjectId && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: "#4ade80" }}>
                        <CheckCircle2 size={10} />
                        Set via environment
                      </span>
                    )}
                    {envHasProjectId === false && !watsonxProjectId && (
                      <span className="text-[10px]" style={{ color: "#f87171" }}>Not set in environment</span>
                    )}
                    {watsonxProjectId && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: "#4ade80" }}>
                        <CheckCircle2 size={10} />
                        Will override env
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={watsonxProjectId}
                    onChange={(e) => setWatsonxProjectId(e.target.value)}
                    onBlur={() => onWatsonxProjectIdChange(watsonxProjectId.trim())}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    style={inputStyle}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-[11px] mt-1.5" style={{ color: "#475569" }}>
                    Found in watsonx.ai → your project → Manage tab → General → Project ID.
                  </p>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mx-5 mb-1 flex items-start gap-2 px-3 py-2.5 rounded-lg" style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <AlertCircle size={13} style={{ color: "#ef4444", marginTop: "1px", flexShrink: 0 }} />
                  <span className="text-[12px] leading-relaxed" style={{ color: "#fca5a5" }}>{error}</span>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 px-5 py-4 border-t shrink-0" style={{ borderColor: "#1e2d4a" }}>
                {isConnected ? (
                  <motion.button
                    onClick={handleDisconnect}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
                    whileHover={{ backgroundColor: "rgba(239,68,68,0.08)" }}
                    whileTap={{ scale: 0.97 }}
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
                    style={{ color: "#64748b", border: "1px solid #1e2d4a" }}
                    whileHover={{ backgroundColor: "rgba(30,45,74,0.6)", color: "#f8fafc" }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    onClick={() => void handleConnect()}
                    disabled={!canConnect}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                    style={{
                      background: canConnect ? "linear-gradient(135deg, #00c2cb, #0099a3)" : "#1e2d4a",
                      color: canConnect ? "#fff" : "#475569",
                      cursor: canConnect ? "pointer" : "not-allowed",
                      boxShadow: canConnect ? "0 2px 12px rgba(0,194,203,0.25)" : "none",
                    }}
                    whileHover={canConnect ? { scale: 1.02 } : {}}
                    whileTap={canConnect ? { scale: 0.97 } : {}}
                  >
                    {loading && <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><Loader2 size={13} /></motion.div>}
                    {loading ? "Connecting…" : isConnected ? "Update" : "Connect"}
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
