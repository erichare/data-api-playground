"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Check, Copy, Loader2, X } from "lucide-react";
import type { BackendConnectionState, DataApiBackendKind } from "@/lib/backends/types";
import type {
  KnowledgeBackendCapabilities,
  KnowledgeBackendMode,
  OpenragKnowledgeState,
} from "@/lib/knowledge/types";
import { DATA_API_KNOWLEDGE_BACKEND_CAPABILITIES } from "@/lib/knowledge/types";
import type { IngestedDocumentSummary } from "@/lib/types";
import { useDocumentChunks } from "@/components/ingest/hooks/useDocumentChunks";
import { FileIcon, formatBytes, formatDate } from "@/components/ingest/ingestShared";

interface DocumentViewerProps {
  doc: IngestedDocumentSummary;
  connection: BackendConnectionState | null;
  astraToken?: string;
  astraEndpoint?: string;
  keyspace: string;
  isConnected: boolean;
  selectedBackend: DataApiBackendKind;
  knowledgeBackendMode?: KnowledgeBackendMode;
  openragConnection?: OpenragKnowledgeState | null;
  knowledgeCapabilities?: KnowledgeBackendCapabilities;
  onClose: () => void;
}

export function DocumentViewer({
  doc,
  connection,
  astraToken,
  astraEndpoint,
  keyspace,
  isConnected,
  selectedBackend = "astra",
  knowledgeBackendMode = "connected",
  openragConnection = null,
  knowledgeCapabilities = DATA_API_KNOWLEDGE_BACKEND_CAPABILITIES,
  onClose,
}: DocumentViewerProps) {
  const { chunks, loading, error, copied, copyAll } = useDocumentChunks({
    doc,
    connection,
    astraToken,
    astraEndpoint,
    selectedBackend,
    knowledgeBackendMode,
    openragConnection,
    keyspace,
    isConnected,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18 }}
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          width: "min(860px, 92vw)",
          height: "min(700px, 88vh)",
          backgroundColor: "var(--bg-panel)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          <FileIcon type={doc.file_type} size={16} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)", fontFamily: "IBM Plex Mono, monospace" }}>
              {doc.source_filename}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {doc.chunk_total} {doc.chunk_total === 1 ? "chunk" : "chunks"} · {formatBytes(doc.file_size)} · {formatDate(doc.ingested_at)}
            </p>
          </div>

          {chunks.length > 0 && (
            <motion.button
              onClick={copyAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                backgroundColor: copied ? "#16a34a20" : "var(--bg-card)",
                color: copied ? "#16a34a" : "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
              whileTap={{ scale: 0.97 }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy all"}
            </motion.button>
          )}

          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-card)" }}>
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading chunks…</span>
            </div>
          ) : !isConnected ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3" style={{ color: "var(--text-muted)" }}>
              <AlertCircle size={20} strokeWidth={1.5} />
              <p className="text-sm">
                Connect to {selectedBackend === "hcd" ? "DataStax HCD" : "Astra DB"} to view document content
              </p>
            </div>
          ) : !knowledgeCapabilities.documentContentLoad ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3" style={{ color: "var(--text-muted)" }}>
              <AlertCircle size={20} strokeWidth={1.5} />
              <p className="text-sm">
                The active knowledge backend does not expose stored chunk content
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <AlertCircle size={20} style={{ color: "#ef4444" }} />
              <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>
            </div>
          ) : chunks.length === 0 ? (
            <div className="flex items-center justify-center h-32" style={{ color: "var(--text-muted)" }}>
              <p className="text-sm">No chunks found</p>
            </div>
          ) : (
            <div className="space-y-0">
              {chunks.map((chunk, i) => (
                <div key={chunk.chunk_index}>
                  <div className="flex items-center gap-2 mb-2 sticky top-0 py-1" style={{ backgroundColor: "var(--bg-panel)" }}>
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded"
                      style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
                    >
                      chunk {chunk.chunk_index + 1} / {doc.chunk_total}
                    </span>
                  </div>
                  <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans mb-4" style={{ color: "var(--text-primary)" }}>
                    {chunk.content}
                  </pre>
                  {i < chunks.length - 1 && (
                    <div className="border-b mb-4" style={{ borderColor: "var(--border-subtle)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
