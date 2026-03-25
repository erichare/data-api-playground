"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Zap, Database, MessageSquare, ChevronDown, CheckCircle2, Loader2, Clock, Minus, XCircle, Table2, Code2 } from "lucide-react";
import type { PipelineStep, PipelineStepId } from "@/lib/types";

interface PipelineTraceProps {
  steps: PipelineStep[];
  defaultExpanded?: boolean;
}

const STEP_META: Record<PipelineStepId, { label: string; colorVar: string; icon: React.ElementType }> = {
  analyze: { label: "Analyze Query",       colorVar: "var(--step-analyze)", icon: Search       },
  embed:   { label: "Embed with Granite",  colorVar: "var(--step-embed)",   icon: Zap          },
  search:  { label: "Search Astra DB",     colorVar: "var(--step-search)",  icon: Database     },
  respond: { label: "Generate Response",   colorVar: "var(--step-respond)", icon: MessageSquare },
};

const ORDER: PipelineStepId[] = ["analyze", "embed", "search", "respond"];

type CodeLang = "ts" | "python" | "java";
const LANG_LABELS: Record<CodeLang, string> = { ts: "TS", python: "Py", java: "Java" };
const LANG_NAMES: Record<CodeLang, string> = { ts: "astra-db-ts", python: "astrapy · python", java: "astra-db-java" };

function toPythonCommand(tsCmd: string): string {
  const limit = tsCmd.match(/limit:\s*(\d+)/)?.[1] ?? "5";
  if (tsCmd.includes(".findAndRerank(")) return `collection.find_and_rerank(\n  {},\n  sort={"$hybrid": {"$vectorize": query}},\n  limit=${limit}\n)`;
  if (tsCmd.includes("$vectorize")) return `collection.find(\n  {},\n  sort={"$vectorize": query},\n  limit=${limit},\n  include_similarity=True\n)`;
  if (tsCmd.includes("$vector")) return `collection.find(\n  {},\n  sort={"$vector": embedding},\n  limit=${limit},\n  include_similarity=True\n)`;
  const sortMatch = tsCmd.match(/sort:\s*\{\s*(\w+):\s*(-?1)/);
  if (sortMatch) {
    const dir = sortMatch[2] === "1" ? "ASCENDING" : "DESCENDING";
    return `from astrapy.constants import SortDocuments\ncollection.find(\n  {},\n  sort={"${sortMatch[1]}": SortDocuments.${dir}},\n  limit=${limit}\n)`;
  }
  return `collection.find({}, limit=${limit})`;
}

function toJavaCommand(tsCmd: string): string {
  const limit = tsCmd.match(/limit:\s*(\d+)/)?.[1] ?? "5";
  if (tsCmd.includes(".findAndRerank(")) return `collection.findAndRerank(\n  Filter.empty(),\n  new FindOneAndRerankOptions()\n    .sort(Sorts.hybrid(query))\n    .limit(${limit})\n)`;
  if (tsCmd.includes("$vectorize")) return `collection.find(\n  Filter.empty(),\n  new FindOptions()\n    .sort(Sorts.vectorize(query))\n    .limit(${limit})\n)`;
  if (tsCmd.includes("$vector")) return `collection.find(\n  Filter.empty(),\n  new FindOptions()\n    .sort(Sorts.vector(embedding))\n    .limit(${limit})\n)`;
  const sortMatch = tsCmd.match(/sort:\s*\{\s*(\w+):\s*(-?1)/);
  if (sortMatch) {
    const dir = sortMatch[2] === "1" ? "ascending" : "descending";
    return `collection.find(\n  Filter.empty(),\n  new FindOptions()\n    .sort(Sorts.${dir}("${sortMatch[1]}"))\n    .limit(${limit})\n)`;
  }
  return `collection.find(Filter.empty(), new FindOptions().limit(${limit}))`;
}

function LangToggle({ lang, onChange }: { lang: CodeLang; onChange: (l: CodeLang) => void }) {
  return (
    <div className="flex gap-0.5">
      {(Object.keys(LANG_LABELS) as CodeLang[]).map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
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
  );
}

type SearchResult = { id: string; similarity: number; preview: Record<string, string | number> };

function SearchStepPreview({ count, results }: {
  count?: number;
  results?: SearchResult[];
}) {
  return (
    <div className="flex flex-col gap-1 pt-1">
      {results && results.length > 0 ? results.map((r, i) => (
        <div
          key={r.id}
          className="rounded-lg px-2 py-1.5 flex flex-col gap-0.5"
          style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[10px] truncate"
              style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}
              title={r.id}
            >
              {i + 1}. {r.id}
            </span>
            {r.similarity > 0 && (
              <span
                className="text-[10px] font-semibold shrink-0"
                style={{
                  color: r.similarity >= 0.9 ? "#10b981" : r.similarity >= 0.7 ? "#f59e0b" : "var(--step-search)",
                }}
              >
                {r.similarity.toFixed(3)}
              </span>
            )}
          </div>
          {Object.entries(r.preview).slice(0, 2).map(([k, v]) => (
            <div key={k} className="flex gap-1.5 items-baseline">
              <span className="text-[9px] shrink-0" style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}>{k}</span>
              <span className="text-[10px] truncate" style={{ color: "var(--text-secondary)" }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )) : (
        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>No results</p>
      )}
    </div>
  );
}

function StepDataPreview({ stepId, data }: { stepId: PipelineStepId; data: Record<string, unknown> }) {
  if (stepId === "analyze") {
    const intent = data.intent ? String(data.intent) : null;
    const collection = data.collection ? String(data.collection) : null;
    const sm = data.searchMode ? String(data.searchMode) : null;
    const limit = data.limit != null ? Number(data.limit) : null;
    const sortField = data.sortField ? String(data.sortField) : null;
    const sortDir = data.sortDir ? String(data.sortDir) : null;
    const filterField = data.filterField ? String(data.filterField) : null;
    const filterOp = data.filterOp ? String(data.filterOp) : "$eq";
    const filterValue = data.filterValue != null ? data.filterValue : null;
    const raw = data._raw ? String(data._raw) : null;
    return (
      <div className="flex flex-col gap-1.5 pt-1">
        {intent && (
          <div className="flex gap-2 items-start">
            <span style={{ color: "var(--text-muted)", fontSize: "10px", minWidth: "52px", paddingTop: "1px" }}>Intent</span>
            <span style={{ color: "var(--text-primary)", fontSize: "11px" }}>{intent}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {collection && (
            <div className="flex gap-1.5 items-center">
              <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>Collection</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold" style={{ backgroundColor: "rgba(255,107,53,0.12)", color: "var(--step-search)" }}>
                {collection}
              </span>
            </div>
          )}
          {sm && (
            <div className="flex gap-1.5 items-center">
              <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>Mode</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "rgba(108,99,255,0.12)", color: "var(--step-analyze)" }}>
                {sm}
              </span>
            </div>
          )}
          {limit != null && (
            <div className="flex gap-1.5 items-center">
              <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>Limit</span>
              <span className="text-[10px] font-mono" style={{ color: "var(--text-primary)" }}>{limit}</span>
            </div>
          )}
          {sortField && (
            <div className="flex gap-1.5 items-center">
              <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>Sort</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold" style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "var(--step-respond)" }}>
                {sortField} {sortDir}
              </span>
            </div>
          )}
          {filterField && (
            <div className="flex gap-1.5 items-center">
              <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>Filter</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold" style={{ backgroundColor: "rgba(108,99,255,0.1)", color: "var(--step-analyze)" }}>
                {filterField} {filterOp !== "$eq" ? filterOp + " " : ""}{JSON.stringify(filterValue)}
              </span>
            </div>
          )}
        </div>
        {raw && (
          <pre className="text-[9px] font-mono px-2 py-1 rounded overflow-x-auto mt-1" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {raw}
          </pre>
        )}
      </div>
    );
  }

  if (stepId === "embed") {
    const preview = data.preview as number[] | undefined;
    const dims = data.dims as number | undefined;
    const real = data.real as boolean | undefined;
    const embedError = data.error as string | undefined;
    return (
      <div className="flex flex-col gap-1.5 pt-1">
        {preview && preview.length > 0 && (
          <div className="px-2 py-1.5 rounded text-[10px] font-mono overflow-x-auto" style={{ backgroundColor: "rgba(0,194,203,0.07)", border: "1px solid rgba(0,194,203,0.2)", color: "var(--step-embed)", whiteSpace: "nowrap" }}>
            [{preview.map((v) => v.toFixed(4)).join(", ")}, …]
          </div>
        )}
        <div className="flex gap-3 items-center flex-wrap">
          {dims && (
            <div className="flex gap-1.5 items-center">
              <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>Dims</span>
              <span style={{ color: "var(--text-primary)", fontSize: "11px", fontFamily: "IBM Plex Mono, monospace" }}>{dims}</span>
            </div>
          )}
          <div className="flex gap-1.5 items-center">
            <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>Source</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: real ? "rgba(34,197,94,0.12)" : "var(--bg-hover)", color: real ? "var(--step-respond)" : "var(--text-muted)" }}>
              {real ? "ibm/slate-125m-english-rtrvr-v2" : "mock"}
            </span>
          </div>
        </div>
        {!real && embedError && (
          <div className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}>
            {embedError}
          </div>
        )}
      </div>
    );
  }

  if (stepId === "search") {
    const count = data.count as number | undefined;
    const results = data.results as SearchResult[] | undefined;
    return <SearchStepPreview count={count} results={results} />;
  }

  if (stepId === "respond") {
    const content = data.content as string | undefined;
    if (!content) return null;
    return (
      <div className="pt-1">
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
          &ldquo;{content.slice(0, 120)}{content.length > 120 ? "…" : ""}&rdquo;
        </p>
      </div>
    );
  }

  return null;
}

function PipelineStepRow({ step }: { step: PipelineStep }) {
  const meta = STEP_META[step.id];
  const Icon = meta.icon;
  const color = meta.colorVar;
  const [expanded, setExpanded] = useState(step.status === "complete");
  const hasData = step.data && Object.keys(step.data).length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        onClick={() => hasData && setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 py-2 px-3 rounded-lg text-left transition-colors"
        style={{
          cursor: hasData ? "pointer" : "default",
          backgroundColor: step.status === "running" ? `rgba(0,0,0,0.03)` : "transparent",
          border: step.status === "running" ? `1px solid var(--border-subtle)` : "1px solid transparent",
        }}
      >
        {/* Status icon */}
        <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color.replace("var(--", "").replace(")", "")}`.includes("step") ? "rgba(0,0,0,0.05)" : "var(--bg-hover)" }}>
          {step.status === "error" ? (
            <XCircle size={11} style={{ color: "#ef4444" }} />
          ) : step.status === "running" ? (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
              <Loader2 size={11} style={{ color }} />
            </motion.div>
          ) : step.status === "complete" ? (
            <CheckCircle2 size={11} style={{ color }} />
          ) : step.status === "skipped" ? (
            <Minus size={11} style={{ color: "var(--text-muted)" }} />
          ) : (
            <Icon size={11} style={{ color: step.status === "pending" ? "var(--text-muted)" : color }} />
          )}
        </div>

        {/* Label + timing */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span
            className="text-[12px] font-medium"
            style={{
              color: step.status === "error" ? "#ef4444"
                : step.status === "pending" || step.status === "skipped" ? "var(--text-muted)"
                : step.status === "running" ? color
                : "var(--text-primary)",
            }}
          >
            {meta.label}{step.status === "skipped" ? " — skipped" : ""}
          </span>
          {step.status === "running" && (
            <motion.div className="flex gap-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: color }}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </motion.div>
          )}
        </div>

        {step.latencyMs !== undefined && (
          <div className="flex items-center gap-1 shrink-0">
            <Clock size={9} style={{ color: "var(--text-muted)" }} />
            <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}>{step.latencyMs}ms</span>
          </div>
        )}

        {hasData && (
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronDown size={12} style={{ color: "var(--text-muted)" }} />
          </motion.div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && hasData && step.data && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-3 pb-2 ml-9">
              <StepDataPreview stepId={step.id} data={step.data} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function PipelineTrace({ steps, defaultExpanded = true }: PipelineTraceProps) {
  const [open, setOpen] = useState(defaultExpanded);

  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const allComplete = steps.length > 0 && steps.every((s) => s.status === "complete" || s.status === "skipped");
  const hasRunning = steps.some((s) => s.status === "running");
  const totalMs = allComplete ? steps.reduce((sum, s) => sum + (s.latencyMs ?? 0), 0) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "var(--bg-panel)", border: "1px solid var(--border-subtle)", marginBottom: "4px" }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        style={{ backgroundColor: "var(--bg-hover)" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {ORDER.map((id) => {
              const s = stepMap.get(id);
              const color = STEP_META[id].colorVar;
              return (
                <motion.div
                  key={id}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: s?.status === "complete" || s?.status === "running" ? color : "var(--border-strong)" }}
                  animate={s?.status === "running" ? { opacity: [0.4, 1, 0.4] } : {}}
                  transition={s?.status === "running" ? { duration: 1, repeat: Infinity } : {}}
                />
              );
            })}
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Pipeline Trace
          </span>
          {hasRunning && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "rgba(255,107,53,0.1)", color: "var(--step-search)" }}>
              Running
            </span>
          )}
          {allComplete && totalMs !== null && (
            <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}>
              {totalMs}ms total
            </span>
          )}
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
        </motion.div>
      </button>

      {/* Steps */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex flex-col px-1 pb-2">
              {ORDER.map((id) => {
                const step = stepMap.get(id);
                if (!step) {
                  return (
                    <div key={id} className="flex items-center gap-3 py-2 px-3 opacity-25">
                      <div className="w-6 h-6 rounded-full border flex items-center justify-center" style={{ borderColor: "var(--border-subtle)" }}>
                        {(() => { const I = STEP_META[id].icon; return <I size={11} style={{ color: "var(--text-muted)" }} />; })()}
                      </div>
                      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{STEP_META[id].label}</span>
                    </div>
                  );
                }
                return <PipelineStepRow key={id} step={step} />;
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
