"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Database,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useRawCollectionBrowser } from "@/components/ingest/hooks/useRawCollectionBrowser";
import {
  getBackendDisplayName,
  type BackendConnectionState,
  type DataApiBackendKind,
} from "@/lib/backends/types";

const SYSTEM_KEYS = new Set(["$vector", "$vectorize", "$similarity"]);

function RawDocRow({ doc }: { doc: Record<string, unknown> }) {
  const [expanded, setExpanded] = React.useState(false);
  const id = String(doc._id ?? "—");
  const entries = Object.entries(doc).filter(([k]) => k !== "_id" && !SYSTEM_KEYS.has(k));
  const hasVector = "$vector" in doc;
  const vectorStr = hasVector
    ? (doc.$vector as string).startsWith("__vector_") ? doc.$vector as string : `__vector_${(doc.$vector as number[]).length}__`
    : null;

  return (
    <div
      className="px-4 py-2.5 hover:bg-opacity-50 transition-colors cursor-pointer select-none"
      style={{ backgroundColor: expanded ? "var(--bg-card)" : "transparent" }}
      onClick={() => setExpanded((e) => !e)}
    >
      <div className="flex items-start gap-2">
        <ChevronRight
          size={11}
          className="mt-0.5 shrink-0 transition-transform"
          style={{ color: "var(--text-muted)", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        />
        <span className="text-xs font-mono shrink-0" style={{ color: "var(--interactive)" }}>
          {id.length > 24 ? id.slice(0, 24) + "…" : id}
        </span>
        {!expanded && (
          <span className="text-xs truncate flex-1" style={{ color: "var(--text-muted)" }}>
            {entries.slice(0, 3).map(([k, v]) => (
              <span key={k} className="mr-2">
                <span style={{ color: "var(--text-muted)" }}>{k}: </span>
                <span style={{ color: "var(--text-primary)" }}>
                  {typeof v === "string" ? (v.length > 40 ? v.slice(0, 40) + "…" : v) : JSON.stringify(v)}
                </span>
              </span>
            ))}
          </span>
        )}
        {vectorStr && (
          <span
            className="shrink-0 text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ backgroundColor: "#a855f720", color: "#a855f7" }}
          >
            {vectorStr.replace("__vector_", "").replace("__", "")}d
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden mt-2 ml-5"
          >
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--border-subtle)" }}
            >
              {entries.map(([k, v], i) => (
                <div
                  key={k}
                  className="flex gap-3 px-3 py-1.5 text-xs border-b last:border-b-0"
                  style={{ borderColor: "var(--border-subtle)", backgroundColor: i % 2 === 0 ? "transparent" : "var(--bg-primary)" }}
                >
                  <span className="shrink-0 font-mono" style={{ color: "var(--text-muted)", minWidth: 120 }}>{k}</span>
                  <span className="flex-1 font-mono break-all" style={{ color: "var(--text-primary)" }}>
                    {typeof v === "string" ? v : JSON.stringify(v)}
                  </span>
                </div>
              ))}
              {vectorStr && (
                <div className="flex gap-3 px-3 py-1.5 text-xs" style={{ backgroundColor: "#a855f710" }}>
                  <span className="shrink-0 font-mono" style={{ color: "#a855f7", minWidth: 120 }}>$vector</span>
                  <span className="text-xs font-mono" style={{ color: "#a855f7" }}>[{vectorStr.replace("__vector_", "").replace("__", "")} dimensions]</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React from "react";

interface RawCollectionBrowserProps {
  isConnected: boolean;
  selectedCollection: string;
  connection: BackendConnectionState | null;
  keyspace: string;
  selectedBackend: DataApiBackendKind;
}

export function RawCollectionBrowser(props: RawCollectionBrowserProps) {
  const {
    rawOpen,
    setRawOpen,
    rawDocs,
    loadingRaw,
    rawError,
    rawPageState,
    rawPageIndex,
    resetAndLoadFirstPage,
    goToPreviousPage,
    goToNextPage,
  } = useRawCollectionBrowser(props);

  return (
    <div className="border-t shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
      <button
        className="w-full flex items-center gap-2 px-6 py-3 text-left"
        style={{ backgroundColor: "var(--bg-panel)" }}
        onClick={() => setRawOpen((o) => !o)}
      >
        <Database size={13} style={{ color: "var(--text-muted)" }} />
        <span className="text-xs font-semibold flex-1" style={{ color: "var(--text-primary)" }}>
          Raw Collection
        </span>
        <span className="text-xs mr-2" style={{ color: "var(--text-muted)" }}>
          {props.selectedCollection}
        </span>
        {rawOpen
          ? <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
          : <ChevronRight size={13} style={{ color: "var(--text-muted)" }} />}
      </button>

      <AnimatePresence initial={false}>
        {rawOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 320, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden flex flex-col border-t"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div
              className="flex items-center gap-2 px-6 py-2 shrink-0 border-b"
              style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-subtle)" }}
            >
              <span className="text-xs flex-1" style={{ color: "var(--text-muted)" }}>
                {loadingRaw ? "Loading…" : rawError ? "" : `${rawDocs.length} documents (page ${rawPageIndex + 1})`}
              </span>
              <button
                className="text-xs px-2 py-1 rounded"
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  color: rawPageIndex === 0 ? "var(--text-muted)" : "var(--text-primary)",
                  cursor: rawPageIndex === 0 ? "not-allowed" : "pointer",
                }}
                disabled={rawPageIndex === 0 || loadingRaw}
                onClick={goToPreviousPage}
              >
                ← Prev
              </button>
              <button
                className="text-xs px-2 py-1 rounded"
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  color: rawPageState ? "var(--text-primary)" : "var(--text-muted)",
                  cursor: rawPageState ? "pointer" : "not-allowed",
                }}
                disabled={!rawPageState || loadingRaw}
                onClick={goToNextPage}
              >
                Next →
              </button>
              <button
                onClick={resetAndLoadFirstPage}
                disabled={loadingRaw}
                style={{ color: "var(--text-muted)" }}
                title="Refresh"
              >
                <RefreshCw size={12} className={loadingRaw ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!props.isConnected ? (
                <div className="flex items-center justify-center h-full" style={{ color: "var(--text-muted)" }}>
                  <span className="text-xs">
                    Connect to {getBackendDisplayName(props.selectedBackend)} to browse raw documents
                  </span>
                </div>
              ) : loadingRaw ? (
                <div className="flex items-center justify-center h-full gap-2" style={{ color: "var(--text-muted)" }}>
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">Loading…</span>
                </div>
              ) : rawError ? (
                <div className="flex items-center justify-center h-full gap-2" style={{ color: "#ef4444" }}>
                  <AlertCircle size={14} />
                  <span className="text-xs">{rawError}</span>
                </div>
              ) : rawDocs.length === 0 ? (
                <div className="flex items-center justify-center h-full" style={{ color: "var(--text-muted)" }}>
                  <span className="text-xs">No documents in this collection</span>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {rawDocs.map((doc, i) => (
                    <RawDocRow key={String(doc._id ?? i)} doc={doc} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
