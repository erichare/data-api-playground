"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Loader2, Cpu, Zap } from "lucide-react";
import type { Collection } from "@/lib/types";

interface NewCollectionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (collection: Collection) => void;
  astraToken?: string;
  astraEndpoint?: string;
}

interface ProviderModel {
  provider: string;
  providerDisplayName: string;
  modelName: string;
  vectorDimension: number | null;
}

const METRICS = ["cosine", "dot_product", "euclidean"] as const;

type CodeLang = "ts" | "python" | "java";

const I = (n: number) => ({ paddingLeft: `${n * 1.2}em` });
// Syntax-token colours — intentionally kept as fixed palette so code looks
// the same in both light and dark themes (same as other code panels).
const T = {
  base:   "var(--text-secondary)",
  kw:     "var(--interactive)",          // await / method names
  ident:  "var(--step-analyze)",         // db / class names
  method: "var(--step-embed)",           // createCollection
  str:    "var(--step-respond)",         // string literals
  num:    "#818cf8",                     // numbers — neutral purple, fine on both
};

const LANG_LABELS: Record<CodeLang, string> = { ts: "TS", python: "Py", java: "Java" };
const LANG_NAMES: Record<CodeLang, string> = { ts: "astra-db-ts", python: "astrapy · python", java: "astra-db-java" };

function CodePreview({ name, dimension, metric, mode, provider, model }: {
  name: string; dimension: number; metric: string;
  mode: "vectorize" | "client"; provider: string; model: string;
}) {
  const [lang, setLang] = useState<CodeLang>("ts");
  const displayName = name || "my_collection";
  const metricUpper = metric.toUpperCase();

  return (
    <div
      className="rounded-lg overflow-hidden text-[12px] leading-relaxed"
      style={{
        backgroundColor: "var(--bg-primary)",
        border: "1px solid var(--border-subtle)",
        fontFamily: "IBM Plex Mono, monospace",
      }}
    >
      {/* Header with lang toggle */}
      <div
        className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b"
        style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-panel)" }}
      >
        <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          {LANG_NAMES[lang]}
        </span>
        <div className="flex gap-0.5">
          {(Object.keys(LANG_LABELS) as CodeLang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: lang === l ? "var(--interactive-light)" : "transparent",
                color: lang === l ? "var(--interactive)" : "var(--text-muted)",
                border: lang === l ? "1px solid var(--interactive-border)" : "1px solid transparent",
              }}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      {/* Code */}
      <div className="px-3 py-2.5 overflow-x-auto">
        {lang === "ts" && (
          <>
            <div style={I(0)}><span style={{ color: T.kw }}>await </span><span style={{ color: T.ident }}>db</span><span style={{ color: T.base }}>.</span><span style={{ color: T.method }}>createCollection</span><span style={{ color: T.base }}>(</span></div>
            <div style={I(1)}><span style={{ color: T.str }}>&quot;{displayName}&quot;</span><span style={{ color: T.base }}>, &#123;</span></div>
            <div style={I(2)}><span style={{ color: T.base }}>vector: &#123;</span></div>
            {mode === "vectorize" ? (<>
              <div style={I(3)}><span style={{ color: T.base }}>service: &#123;</span></div>
              <div style={I(4)}><span style={{ color: T.base }}>provider: </span><span style={{ color: T.str }}>&quot;{provider}&quot;</span><span style={{ color: T.base }}>,</span></div>
              <div style={I(4)}><span style={{ color: T.base }}>modelName: </span><span style={{ color: T.str }}>&quot;{model}&quot;</span><span style={{ color: T.base }}>,</span></div>
              <div style={I(3)}><span style={{ color: T.base }}>&#125;,</span></div>
            </>) : (<>
              <div style={I(3)}><span style={{ color: T.base }}>dimension: </span><span style={{ color: T.num }}>{dimension}</span><span style={{ color: T.base }}>,</span></div>
              <div style={I(3)}><span style={{ color: T.base }}>metric: </span><span style={{ color: T.str }}>&quot;{metric}&quot;</span><span style={{ color: T.base }}>,</span></div>
            </>)}
            <div style={I(2)}><span style={{ color: T.base }}>&#125;,</span></div>
            <div style={I(1)}><span style={{ color: T.base }}>&#125;</span></div>
            <div style={I(0)}><span style={{ color: T.base }}>)</span></div>
          </>
        )}
        {lang === "python" && (
          <>
            <div style={I(0)}><span style={{ color: T.kw }}>await </span><span style={{ color: T.ident }}>db</span><span style={{ color: T.base }}>.</span><span style={{ color: T.method }}>create_collection</span><span style={{ color: T.base }}>(</span></div>
            <div style={I(1)}><span style={{ color: T.str }}>&quot;{displayName}&quot;</span><span style={{ color: T.base }}>,</span></div>
            <div style={I(1)}><span style={{ color: T.base }}>definition=</span><span style={{ color: T.ident }}>CollectionDefinition</span><span style={{ color: T.base }}>(</span></div>
            <div style={I(2)}><span style={{ color: T.base }}>vector=</span><span style={{ color: T.ident }}>CollectionVectorOptions</span><span style={{ color: T.base }}>(</span></div>
            {mode === "vectorize" ? (<>
              <div style={I(3)}><span style={{ color: T.base }}>service=</span><span style={{ color: T.ident }}>VectorServiceOptions</span><span style={{ color: T.base }}>(</span></div>
              <div style={I(4)}><span style={{ color: T.base }}>provider=</span><span style={{ color: T.str }}>&quot;{provider}&quot;</span><span style={{ color: T.base }}>,</span></div>
              <div style={I(4)}><span style={{ color: T.base }}>model_name=</span><span style={{ color: T.str }}>&quot;{model}&quot;</span><span style={{ color: T.base }}>,</span></div>
              <div style={I(3)}><span style={{ color: T.base }}>),</span></div>
            </>) : (<>
              <div style={I(3)}><span style={{ color: T.base }}>dimension=</span><span style={{ color: T.num }}>{dimension}</span><span style={{ color: T.base }}>,</span></div>
              <div style={I(3)}><span style={{ color: T.base }}>metric=</span><span style={{ color: T.ident }}>VectorMetric</span><span style={{ color: T.base }}>.</span><span style={{ color: T.str }}>{metricUpper}</span><span style={{ color: T.base }}>,</span></div>
            </>)}
            <div style={I(2)}><span style={{ color: T.base }}>),</span></div>
            <div style={I(1)}><span style={{ color: T.base }}>),</span></div>
            <div style={I(0)}><span style={{ color: T.base }}>)</span></div>
          </>
        )}
        {lang === "java" && (
          <>
            <div style={I(0)}><span style={{ color: T.ident }}>db</span><span style={{ color: T.base }}>.</span><span style={{ color: T.method }}>createCollection</span><span style={{ color: T.base }}>(</span></div>
            <div style={I(1)}><span style={{ color: T.str }}>&quot;{displayName}&quot;</span><span style={{ color: T.base }}>,</span></div>
            <div style={I(1)}><span style={{ color: T.ident }}>CollectionDefinition</span><span style={{ color: T.base }}>.builder()</span></div>
            <div style={I(2)}><span style={{ color: T.base }}>.vector(</span><span style={{ color: T.ident }}>CollectionVectorDefinition</span><span style={{ color: T.base }}>.builder()</span></div>
            {mode === "vectorize" ? (<>
              <div style={I(3)}><span style={{ color: T.base }}>.service(</span><span style={{ color: T.ident }}>CollectionVectorServiceDefinition</span><span style={{ color: T.base }}>.builder()</span></div>
              <div style={I(4)}><span style={{ color: T.base }}>.provider(</span><span style={{ color: T.str }}>&quot;{provider}&quot;</span><span style={{ color: T.base }}>)</span></div>
              <div style={I(4)}><span style={{ color: T.base }}>.modelName(</span><span style={{ color: T.str }}>&quot;{model}&quot;</span><span style={{ color: T.base }}>)</span></div>
              <div style={I(4)}><span style={{ color: T.base }}>.build())</span></div>
            </>) : (<>
              <div style={I(3)}><span style={{ color: T.base }}>.dimension(</span><span style={{ color: T.num }}>{dimension}</span><span style={{ color: T.base }}>)</span></div>
              <div style={I(3)}><span style={{ color: T.base }}>.metric(</span><span style={{ color: T.ident }}>SimilarityMetric</span><span style={{ color: T.base }}>.</span><span style={{ color: T.str }}>{metricUpper}</span><span style={{ color: T.base }}>)</span></div>
            </>)}
            <div style={I(2)}><span style={{ color: T.base }}>.build())</span></div>
            <div style={I(1)}><span style={{ color: T.base }}>.build()</span></div>
            <div style={I(0)}><span style={{ color: T.base }}>)</span></div>
          </>
        )}
      </div>
    </div>
  );
}

export function NewCollectionDialog({ open, onClose, onCreated, astraToken, astraEndpoint }: NewCollectionDialogProps) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"vectorize" | "client">("vectorize");

  // Vectorize mode state
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providersError, setProvidersError] = useState("");

  // Client-side mode state
  const [dimension, setDimension] = useState(768);
  const [metric, setMetric] = useState<typeof METRICS[number]>("cosine");

  // Submit state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isConnected = !!(astraToken && astraEndpoint);

  useEffect(() => {
    if (!open || !isConnected || mode !== "vectorize") return;
    if (providerModels.length > 0) return;

    setLoadingProviders(true);
    setProvidersError("");
    fetch("/api/embedding-providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: astraToken, endpoint: astraEndpoint }),
    })
      .then((r) => r.json() as Promise<{ models?: ProviderModel[]; error?: string }>)
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setProviderModels(data.models ?? []);
        setSelectedModelIdx(0);
      })
      .catch((err: unknown) => setProvidersError(err instanceof Error ? err.message : "Failed to load providers"))
      .finally(() => setLoadingProviders(false));
  }, [open, isConnected, mode, astraToken, astraEndpoint, providerModels.length]);

  const selectedModel = providerModels[selectedModelIdx] ?? null;

  const handleCreate = async () => {
    if (!name.trim() || loading) return;
    setError("");

    if (isConnected) {
      if (mode === "vectorize" && !selectedModel) return;
      setLoading(true);
      try {
        const body = mode === "vectorize"
          ? { token: astraToken, endpoint: astraEndpoint, name: name.trim(), provider: selectedModel!.provider, model: selectedModel!.modelName, dimension: selectedModel!.vectorDimension ?? 1024, metric: "cosine" }
          : { token: astraToken, endpoint: astraEndpoint, name: name.trim(), provider: "none", model: "", dimension, metric };

        const res = await fetch("/api/create-collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json() as { collection?: Collection; error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? "Failed to create collection");
        onCreated(data.collection!);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create collection");
        return;
      } finally {
        setLoading(false);
      }
    } else {
      onCreated({
        name: name.trim(),
        count: 0,
        vectorDim: mode === "vectorize" ? null : dimension,
        vectorizeService: mode === "vectorize" ? { provider: "nvidia", modelName: "NV-Embed-QA" } : null,
      });
    }

    setName("");
    setError("");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }} transition={{ duration: 0.2, ease: "easeOut" }}
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
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-4 border-b shrink-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, var(--interactive-light), rgba(108,99,255,0.15))",
                      border: "1px solid var(--interactive-border)",
                    }}
                  >
                    <Plus size={14} style={{ color: "var(--interactive)" }} />
                  </div>
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>New Collection</h2>
                </div>
                <motion.button
                  onClick={onClose}
                  className="p-1.5 rounded-lg"
                  style={{ color: "var(--text-muted)" }}
                  whileHover={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X size={14} />
                </motion.button>
              </div>

              {/* Form */}
              <div className="flex flex-col gap-4 px-5 py-4">
                {/* Name */}
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

                {/* Mode toggle */}
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Embedding Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["vectorize", "client"] as const).map((m) => {
                      const active = mode === m;
                      return (
                        <motion.button
                          key={m}
                          onClick={() => setMode(m)}
                          className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-left"
                          style={{
                            backgroundColor: active
                              ? (m === "vectorize" ? "rgba(108,99,255,0.1)" : "rgba(0,194,203,0.08)")
                              : "var(--bg-card)",
                            border: `1px solid ${active
                              ? (m === "vectorize" ? "rgba(108,99,255,0.45)" : "rgba(0,194,203,0.35)")
                              : "var(--border-subtle)"}`,
                          }}
                          whileHover={{
                            borderColor: m === "vectorize" ? "rgba(108,99,255,0.45)" : "rgba(0,194,203,0.35)",
                          }}
                          whileTap={{ scale: 0.97 }}
                        >
                          {m === "vectorize"
                            ? <Zap size={15} style={{ color: active ? "var(--step-analyze)" : "var(--text-muted)", flexShrink: 0 }} />
                            : <Cpu size={15} style={{ color: active ? "var(--step-embed)" : "var(--text-muted)", flexShrink: 0 }} />}
                          <div>
                            <div className="text-xs font-semibold" style={{ color: active ? "var(--text-primary)" : "var(--text-muted)" }}>
                              {m === "vectorize" ? "Vectorize" : "Client-Side"}
                            </div>
                            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              {m === "vectorize" ? "Server-side embeddings" : "Bring your own vectors"}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Vectorize: model picker */}
                {mode === "vectorize" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
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
                      <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        <Loader2 size={12} className="animate-spin" /> Loading models…
                      </div>
                    ) : providersError ? (
                      <div
                        className="text-xs px-3 py-2 rounded-lg"
                        style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
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
                        {providerModels.map((pm, i) => (
                          <option key={i} value={i}>
                            {pm.providerDisplayName} — {pm.modelName}{pm.vectorDimension ? ` (${pm.vectorDimension}d)` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedModel?.vectorDimension && (
                      <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                        Vector dimension: <span style={{ color: "var(--text-secondary)" }}>{selectedModel.vectorDimension}</span> · Metric determined by model
                      </p>
                    )}
                  </motion.div>
                )}

                {/* Client-side: dimension + metric */}
                {mode === "client" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
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
                        min={1} max={4096}
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
                        onChange={(e) => setMetric(e.target.value as typeof METRICS[number])}
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
                        {METRICS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </motion.div>
                )}

                {/* Code preview */}
                <div>
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Generated Code
                  </label>
                  <CodePreview
                    name={name} dimension={dimension} metric={metric} mode={mode}
                    provider={selectedModel?.provider ?? "nvidia"}
                    model={selectedModel?.modelName ?? "NV-Embed-QA"}
                  />
                </div>
              </div>

              {/* Footer */}
              <div
                className="flex flex-col gap-2 px-5 py-4 border-t shrink-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {error && (
                  <div
                    className="text-xs rounded-lg px-3 py-2"
                    style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                  >
                    {error}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  {!isConnected && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Demo mode — not saved to Astra DB</span>
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
                      }}
                      whileHover={!loading ? { backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" } : {}}
                      whileTap={!loading ? { scale: 0.97 } : {}}
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      onClick={() => void handleCreate()}
                      disabled={!name.trim() || loading || (mode === "vectorize" && isConnected && !selectedModel)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                      style={{
                        backgroundColor: (name.trim() && !loading) ? "var(--interactive)" : "var(--bg-hover)",
                        color: (name.trim() && !loading) ? "#fff" : "var(--text-muted)",
                        cursor: (name.trim() && !loading) ? "pointer" : "not-allowed",
                        boxShadow: (name.trim() && !loading) ? "0 2px 12px var(--interactive-border)" : "none",
                      }}
                      whileHover={(name.trim() && !loading) ? { scale: 1.02 } : {}}
                      whileTap={(name.trim() && !loading) ? { scale: 0.97 } : {}}
                    >
                      {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
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
