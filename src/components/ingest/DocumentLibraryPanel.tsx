"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { IngestFileType, IngestedDocumentSummary } from "@/lib/types";
import {
  FileIcon,
  TypeBadge,
  formatBytes,
  formatDate,
} from "@/components/ingest/ingestShared";

interface DocumentLibraryPanelProps {
  filteredDocs: IngestedDocumentSummary[];
  loadingDocs: boolean;
  loadError: string;
  search: string;
  setSearch: (value: string) => void;
  filterType: IngestFileType | "all";
  setFilterType: (value: IngestFileType | "all") => void;
  loadDocuments: () => void;
  deletingId: string | null;
  onDelete: (doc: IngestedDocumentSummary) => void;
  onView: (doc: IngestedDocumentSummary) => void;
  isConnected: boolean;
}

export function DocumentLibraryPanel({
  filteredDocs,
  loadingDocs,
  loadError,
  search,
  setSearch,
  filterType,
  setFilterType,
  loadDocuments,
  deletingId,
  onDelete,
  onView,
  isConnected,
}: DocumentLibraryPanelProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div
        className="px-6 py-3 border-b flex items-center gap-3"
        style={{
          backgroundColor: "var(--bg-panel)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex-1">
          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            Document Library
            <span
              className="ml-2 px-1.5 py-0.5 rounded text-xs font-normal"
              style={{
                backgroundColor: "var(--bg-card)",
                color: "var(--text-muted)",
              }}
            >
              {filteredDocs.length}
            </span>
          </p>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files…"
          className="rounded-lg px-3 py-1.5 text-xs outline-none"
          style={{
            width: "180px",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        />

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as IngestFileType | "all")}
          className="rounded-lg px-2 py-1.5 text-xs outline-none"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        >
          <option value="all">All types</option>
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
          <option value="md">Markdown</option>
          <option value="txt">Text</option>
          <option value="csv">CSV</option>
          <option value="xlsx">XLSX</option>
          <option value="json">JSON</option>
        </select>

        <button
          onClick={() => void loadDocuments()}
          disabled={loadingDocs}
          style={{ color: "var(--text-muted)" }}
          title="Refresh"
        >
          <RefreshCw size={13} className={loadingDocs ? "animate-spin" : ""} />
        </button>
      </div>

      <div
        className="px-6 py-2 grid gap-4 border-b"
        style={{
          gridTemplateColumns: "1fr 160px 80px 60px 90px 80px 36px",
          borderColor: "var(--border-subtle)",
          backgroundColor: "var(--bg-panel)",
        }}
      >
        {["File", "Doc ID", "Type", "Chunks", "Size", "Ingested", ""].map(
          (header) => (
            <span
              key={header}
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {header}
            </span>
          )
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadError && (
          <div
            className="mx-6 mt-4 rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#fca5a5",
            }}
          >
            {loadError}
          </div>
        )}
        {loadingDocs ? (
          <div
            className="flex items-center justify-center h-32 gap-2"
            style={{ color: "var(--text-muted)" }}
          >
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Loading documents…</span>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-48 gap-3"
            style={{ color: "var(--text-muted)" }}
          >
            <FileText size={24} strokeWidth={1.5} />
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                No documents yet
              </p>
              <p className="text-xs mt-1">Upload a file to get started</p>
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredDocs.map((doc) => (
              <DocumentRow
                key={doc.source_doc_id}
                doc={doc}
                onDelete={onDelete}
                onView={onView}
                deleting={deletingId === doc.source_doc_id}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {!isConnected && (
        <div
          className="px-6 py-2 border-t flex items-center gap-2"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-panel)",
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#f97316" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Demo mode — connect to Astra DB to persist documents
          </span>
        </div>
      )}
    </div>
  );
}

function DocumentRow({
  doc,
  onDelete,
  onView,
  deleting,
}: {
  doc: IngestedDocumentSummary;
  onDelete: (doc: IngestedDocumentSummary) => void;
  onView: (doc: IngestedDocumentSummary) => void;
  deleting: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.15 }}
      className="px-6 py-3 grid gap-4 border-b items-center cursor-pointer"
      style={{
        gridTemplateColumns: "1fr 160px 80px 60px 90px 80px 64px",
        borderColor: "var(--border-subtle)",
        backgroundColor: hovered ? "var(--bg-hover)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onView(doc)}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <FileIcon type={doc.file_type} size={14} />
        <span
          className="text-xs truncate"
          style={{
            color: "var(--text-primary)",
            fontFamily: "IBM Plex Mono, monospace",
          }}
          title={doc.source_filename}
        >
          {doc.source_filename}
        </span>
        <ChevronRight
          size={11}
          style={{
            color: "var(--text-muted)",
            opacity: hovered ? 1 : 0,
            flexShrink: 0,
            transition: "opacity 0.15s",
          }}
        />
      </div>

      <span
        className="text-xs font-mono truncate"
        style={{ color: "var(--text-muted)" }}
        title={doc.source_doc_id}
      >
        {doc.source_doc_id.length > 18
          ? `${doc.source_doc_id.slice(0, 18)}…`
          : doc.source_doc_id}
      </span>

      <TypeBadge type={doc.file_type} />

      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
        {doc.chunk_total} {doc.chunk_total === 1 ? "chunk" : "chunks"}
      </span>

      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {formatBytes(doc.file_size)}
      </span>

      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {formatDate(doc.ingested_at)}
      </span>

      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <AnimatePresence>
          {hovered && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => onDelete(doc)}
              disabled={deleting}
              className="p-1.5 rounded-md"
              style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
              title="Delete document"
            >
              {deleting ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Trash2 size={11} />
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
