"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Cpu, Loader2, Plus, X, Zap } from "lucide-react";
import type { Collection } from "@/lib/types";
import { CollectionCodePreview } from "@/components/collection/CollectionCodePreview";
import { useCollectionForm } from "@/components/collection/hooks/useCollectionForm";
import {
  METRICS,
  type CollectionMode,
} from "@/components/collection/collectionFormShared";

interface NewCollectionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (collection: Collection) => void;
  astraToken?: string;
  astraEndpoint?: string;
  keyspace?: string;
}

const MODES: CollectionMode[] = ["vectorize", "client"];

export function NewCollectionDialog({
  open,
  onClose,
  onCreated,
  astraToken,
  astraEndpoint,
  keyspace,
}: NewCollectionDialogProps) {
  const {
    name,
    setName,
    mode,
    setMode,
    providerModels,
    selectedModelIdx,
    setSelectedModelIdx,
    loadingProviders,
    providersError,
    dimension,
    setDimension,
    metric,
    setMetric,
    loading,
    error,
    isConnected,
    selectedModel,
    canSubmit,
    handleCreate,
  } = useCollectionForm({
    open,
    astraToken,
    astraEndpoint,
    keyspace,
    onCreated,
    onClose,
  });

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
              backgroundColor: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(2px)",
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
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl flex flex-col"
              style={{
                backgroundColor: "var(--bg-panel)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
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
                      background:
                        "linear-gradient(135deg, var(--interactive-light), rgba(108,99,255,0.15))",
                      border: "1px solid var(--interactive-border)",
                    }}
                  >
                    <Plus size={14} style={{ color: "var(--interactive)" }} />
                  </div>
                  <h2
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    New Collection
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

              <div className="flex flex-col gap-4 px-5 py-4">
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Collection Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. my_embeddings"
                    style={{
                      backgroundColor: "var(--bg-input)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-primary)",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      fontSize: "13px",
                      width: "100%",
                      outline: "none",
                    }}
                    onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
                    autoFocus
                  />
                </div>

                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Embedding Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {MODES.map((nextMode) => {
                      const active = mode === nextMode;
                      return (
                        <motion.button
                          key={nextMode}
                          onClick={() => setMode(nextMode)}
                          className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-left"
                          style={{
                            backgroundColor: active
                              ? nextMode === "vectorize"
                                ? "rgba(108,99,255,0.1)"
                                : "rgba(0,194,203,0.08)"
                              : "var(--bg-card)",
                            border: `1px solid ${
                              active
                                ? nextMode === "vectorize"
                                  ? "rgba(108,99,255,0.45)"
                                  : "rgba(0,194,203,0.35)"
                                : "var(--border-subtle)"
                            }`,
                          }}
                          whileHover={{
                            borderColor:
                              nextMode === "vectorize"
                                ? "rgba(108,99,255,0.45)"
                                : "rgba(0,194,203,0.35)",
                          }}
                          whileTap={{ scale: 0.97 }}
                        >
                          {nextMode === "vectorize" ? (
                            <Zap
                              size={15}
                              style={{
                                color: active
                                  ? "var(--step-analyze)"
                                  : "var(--text-muted)",
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <Cpu
                              size={15}
                              style={{
                                color: active
                                  ? "var(--step-embed)"
                                  : "var(--text-muted)",
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <div>
                            <div
                              className="text-xs font-semibold"
                              style={{
                                color: active
                                  ? "var(--text-primary)"
                                  : "var(--text-muted)",
                              }}
                            >
                              {nextMode === "vectorize" ? "Vectorize" : "Client-Side"}
                            </div>
                            <div
                              className="text-[10px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {nextMode === "vectorize"
                                ? "Server-side embeddings"
                                : "Bring your own vectors"}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {mode === "vectorize" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                  >
                    <label
                      className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Embedding Model
                    </label>
                    {!isConnected ? (
                      <div
                        className="text-xs px-3 py-2 rounded-lg"
                        style={{
                          backgroundColor: "rgba(108,99,255,0.08)",
                          border: "1px solid rgba(108,99,255,0.2)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Connect to Astra DB to browse available models
                      </div>
                    ) : loadingProviders ? (
                      <div
                        className="flex items-center gap-2 px-3 py-2 text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Loader2 size={12} className="animate-spin" />
                        Loading models…
                      </div>
                    ) : providersError ? (
                      <div
                        className="text-xs px-3 py-2 rounded-lg"
                        style={{
                          backgroundColor: "rgba(239,68,68,0.1)",
                          border: "1px solid rgba(239,68,68,0.3)",
                          color: "#f87171",
                        }}
                      >
                        {providersError}
                      </div>
                    ) : (
                      <select
                        value={selectedModelIdx}
                        onChange={(e) => setSelectedModelIdx(Number(e.target.value))}
                        style={{
                          backgroundColor: "var(--bg-input)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-primary)",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          fontSize: "13px",
                          width: "100%",
                          outline: "none",
                          cursor: "pointer",
                        }}
                      >
                        {providerModels.map((providerModel, idx) => (
                          <option key={idx} value={idx}>
                            {providerModel.providerDisplayName} — {providerModel.modelName}
                            {providerModel.vectorDimension
                              ? ` (${providerModel.vectorDimension}d)`
                              : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedModel?.vectorDimension && (
                      <p
                        className="text-[11px] mt-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Vector dimension:{" "}
                        <span style={{ color: "var(--text-secondary)" }}>
                          {selectedModel.vectorDimension}
                        </span>{" "}
                        · Metric determined by model
                      </p>
                    )}
                  </motion.div>
                )}

                {mode === "client" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="flex gap-3"
                  >
                    <div className="flex-1">
                      <label
                        className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Vector Dimension
                      </label>
                      <input
                        type="number"
                        value={dimension}
                        onChange={(e) => setDimension(Number(e.target.value))}
                        min={1}
                        max={4096}
                        style={{
                          backgroundColor: "var(--bg-input)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-primary)",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          fontSize: "13px",
                          width: "100%",
                          outline: "none",
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <label
                        className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Similarity Metric
                      </label>
                      <select
                        value={metric}
                        onChange={(e) =>
                          setMetric((e.target.value as (typeof METRICS)[number]))
                        }
                        style={{
                          backgroundColor: "var(--bg-input)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-primary)",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          fontSize: "13px",
                          width: "100%",
                          outline: "none",
                          cursor: "pointer",
                        }}
                      >
                        {METRICS.map((nextMetric) => (
                          <option key={nextMetric} value={nextMetric}>
                            {nextMetric}
                          </option>
                        ))}
                      </select>
                    </div>
                  </motion.div>
                )}

                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Generated Code
                  </label>
                  <CollectionCodePreview
                    name={name}
                    dimension={dimension}
                    metric={metric}
                    mode={mode}
                    provider={selectedModel?.provider ?? "nvidia"}
                    model={selectedModel?.modelName ?? "NV-Embed-QA"}
                  />
                </div>
              </div>

              <div
                className="flex flex-col gap-2 px-5 py-4 border-t shrink-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {error && (
                  <div
                    className="text-xs rounded-lg px-3 py-2"
                    style={{
                      backgroundColor: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.3)",
                      color: "#f87171",
                    }}
                  >
                    {error}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  {!isConnected && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Demo mode — not saved to Astra DB
                    </span>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    <motion.button
                      onClick={onClose}
                      disabled={loading}
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{
                        color: "var(--text-muted)",
                        border: "1px solid var(--border-subtle)",
                        opacity: loading ? 0.5 : 1,
                        backgroundColor: "rgba(0,0,0,0)",
                      }}
                      whileHover={
                        !loading
                          ? {
                              backgroundColor: "var(--bg-hover)",
                              color: "var(--text-primary)",
                            }
                          : {}
                      }
                      whileTap={!loading ? { scale: 0.97 } : {}}
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      onClick={() => void handleCreate()}
                      disabled={!canSubmit}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{
                        backgroundColor: canSubmit
                          ? "var(--interactive)"
                          : "var(--bg-hover)",
                        color: canSubmit ? "#fff" : "var(--text-muted)",
                        cursor: canSubmit ? "pointer" : "not-allowed",
                        boxShadow: canSubmit
                          ? "0 2px 12px var(--interactive-border)"
                          : "none",
                      }}
                      whileHover={canSubmit ? { scale: 1.02 } : {}}
                      whileTap={canSubmit ? { scale: 0.97 } : {}}
                    >
                      {loading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Plus size={14} />
                      )}
                      {loading ? "Creating…" : "Create Collection"}
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
