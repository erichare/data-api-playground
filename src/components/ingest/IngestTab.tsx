"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  X,
  ChevronRight,
} from "lucide-react";
import type { Collection, IngestFileType, IngestedDocumentSummary } from "@/lib/types";
import { DocumentViewer } from "@/components/ingest/DocumentViewer";
import { RawCollectionBrowser } from "@/components/ingest/RawCollectionBrowser";
import { useDocumentLibrary } from "@/components/ingest/hooks/useDocumentLibrary";
import {
  ACCEPTED,
  ACCEPTED_LABEL,
  FileIcon,
  fileKey,
  FileStatus,
  formatBytes,
  formatDate,
  getFileType,
  TypeBadge,
} from "@/components/ingest/ingestShared";

// ── Props ────────────────────────────────────────────────────────────────────

interface IngestTabProps {
  astraToken: string;
  astraEndpoint: string;
  keyspace: string;
  collections: Collection[];
  activeCollection?: string;
  isConnected: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function IngestTab({ astraToken, astraEndpoint, keyspace, collections, activeCollection, isConnected }: IngestTabProps) {
  // Upload state
  const [isDragOver, setIsDragOver] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [fileStatuses, setFileStatuses] = useState<Map<string, FileStatus>>(new Map());
  const [selectedCollection, setSelectedCollection] = useState(
    activeCollection ?? collections.find((c) => !c.name.startsWith("dap_"))?.name ?? collections[0]?.name ?? ""
  );

  // Keep selector in sync when sidebar selection changes
  useEffect(() => {
    if (activeCollection && activeCollection !== selectedCollection) {
      setSelectedCollection(activeCollection);
    }
  }, [activeCollection, selectedCollection]);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    loadingDocs,
    search,
    setSearch,
    filterType,
    setFilterType,
    deletingId,
    viewingDoc,
    setViewingDoc,
    filteredDocs,
    loadDocuments,
    handleDelete,
    prependDocument,
  } = useDocumentLibrary({
    isConnected,
    selectedCollection,
    astraToken,
    astraEndpoint,
    keyspace,
  });

  // ── File selection ──────────────────────────────────────────────────────

  function addFiles(files: File[]) {
    setQueuedFiles((prev) => {
      const existingKeys = new Set(prev.map(fileKey));
      const fresh = files.filter((f) => !existingKeys.has(fileKey(f)));
      return [...prev, ...fresh];
    });
    setFileStatuses((prev) => {
      const next = new Map(prev);
      for (const f of files) {
        if (!next.has(fileKey(f))) next.set(fileKey(f), { stage: "queued" });
      }
      return next;
    });
  }

  function removeFile(f: File) {
    const k = fileKey(f);
    setQueuedFiles((prev) => prev.filter((x) => fileKey(x) !== k));
    setFileStatuses((prev) => { const next = new Map(prev); next.delete(k); return next; });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  // ── Ingest ──────────────────────────────────────────────────────────────

  async function ingestOne(file: File) {
    const k = fileKey(file);
    const setStatus = (s: FileStatus) =>
      setFileStatuses((prev) => new Map(prev).set(k, s));

    setStatus({ stage: "extracting" });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("collection", selectedCollection);
    formData.append("keyspace", keyspace);
    formData.append("token", astraToken);
    formData.append("endpoint", astraEndpoint);

    try {
      const res = await fetch("/api/ingest-document", { method: "POST", body: formData });
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as Record<string, unknown>;

          if (evt.type === "chunked") {
            setStatus({ stage: "storing", processed: 0, total: evt.chunks as number });
          }
          if (evt.type === "chunk_progress") {
            setStatus({ stage: "storing", processed: evt.processed as number, total: evt.total as number });
          }
          if (evt.type === "complete") {
            const chunks = evt.chunks as number;
            const docId = evt.source_doc_id as string;
            setStatus({ stage: "done", chunks });
            const newDoc: IngestedDocumentSummary = {
              source_doc_id: docId,
              source_filename: file.name,
              file_type: getFileType(file.name),
              file_size: file.size,
              md5_hash: "",
              chunk_total: chunks,
              ingested_at: new Date().toISOString(),
              collection: selectedCollection,
            };
            prependDocument(newDoc);
          }
          if (evt.type === "error") {
            throw new Error(evt.message as string);
          }
        }
      }
    } catch (err) {
      setStatus({ stage: "error", message: err instanceof Error ? err.message : "Ingestion failed" });
    }
  }

  async function handleIngest() {
    if (queuedFiles.length === 0 || uploading) return;
    setUploading(true);
    for (const file of queuedFiles) {
      const k = fileKey(file);
      const status = fileStatuses.get(k);
      if (status?.stage === "done") continue; // skip already completed
      await ingestOne(file);
    }
    setUploading(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── Upload Panel ── */}
      <div
        className="w-64 shrink-0 flex flex-col border-r"
        style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-subtle)" }}
      >
        {/* Panel header */}
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Upload Document</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{ACCEPTED_LABEL}</p>
        </div>

        {/* Drop zone */}
        <div className="p-4">
          <div
            className="relative rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
            style={{
              minHeight: "130px",
              borderColor: isDragOver ? "var(--interactive)" : "var(--border-subtle)",
              backgroundColor: isDragOver ? "var(--interactive-light)" : "var(--bg-card)",
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              className="hidden"
              onChange={handleInputChange}
            />
            <Upload size={20} style={{ color: isDragOver ? "var(--interactive)" : "var(--text-muted)" }} />
            <p className="text-xs text-center" style={{ color: isDragOver ? "var(--interactive)" : "var(--text-muted)" }}>
              {isDragOver ? "Drop to upload" : "Drop file or click"}
            </p>
          </div>
        </div>

        {/* File queue */}
        <AnimatePresence initial={false}>
          {queuedFiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-4 mb-3 rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--border-subtle)" }}
            >
              {queuedFiles.map((file) => {
                const k = fileKey(file);
                const status = fileStatuses.get(k) ?? { stage: "queued" };
                return (
                  <motion.div
                    key={k}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15 }}
                    className="px-3 py-2 border-b last:border-b-0"
                    style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-card)" }}
                  >
                    <div className="flex items-center gap-2">
                      <FileIcon type={getFileType(file.name)} size={13} />
                      <span className="flex-1 text-xs truncate font-mono" style={{ color: "var(--text-primary)" }}>
                        {file.name}
                      </span>
                      {/* Status icon */}
                      {status.stage === "queued" && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>queued</span>
                      )}
                      {status.stage === "extracting" && (
                        <Loader2 size={11} className="animate-spin shrink-0" style={{ color: "var(--interactive)" }} />
                      )}
                      {status.stage === "done" && (
                        <CheckCircle2 size={12} className="shrink-0" style={{ color: "#16a34a" }} />
                      )}
                      {status.stage === "error" && (
                        <span title={status.message}>
                          <AlertCircle size={12} className="shrink-0" style={{ color: "#ef4444" }} />
                        </span>
                      )}
                      {/* Remove button (only when not in-flight) */}
                      {(status.stage === "queued" || status.stage === "done" || status.stage === "error") && !uploading && (
                        <button
                          onClick={() => removeFile(file)}
                          className="shrink-0"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                    {/* Progress bar for storing stage */}
                    {status.stage === "storing" && (
                      <div className="mt-1.5">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Storing…</span>
                          <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                            {status.processed}/{status.total}
                          </span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-primary)" }}>
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: "var(--interactive)" }}
                            animate={{ width: status.total > 0 ? `${Math.round((status.processed / status.total) * 100)}%` : "0%" }}
                            transition={{ ease: "easeOut", duration: 0.3 }}
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collection label */}
        <div className="px-4 mb-3">
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Collection</label>
          <div
            className="rounded-lg px-3 py-2 text-xs truncate font-mono"
            style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
          >
            {selectedCollection || "—"}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Ingest button */}
        <div className="p-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <motion.button
            onClick={() => void handleIngest()}
            disabled={queuedFiles.length === 0 || uploading}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium"
            style={{
              backgroundColor: queuedFiles.length > 0 && !uploading ? "var(--interactive)" : "var(--bg-card)",
              color: queuedFiles.length > 0 && !uploading ? "#fff" : "var(--text-muted)",
              cursor: queuedFiles.length > 0 && !uploading ? "pointer" : "not-allowed",
            }}
            whileTap={queuedFiles.length > 0 && !uploading ? { scale: 0.97 } : {}}
          >
            {uploading ? (
              <><Loader2 size={12} className="animate-spin" /> Processing…</>
            ) : (
              <><Upload size={12} /> {queuedFiles.length > 1 ? `Ingest ${queuedFiles.length} Files` : "Ingest Document"}</>
            )}
          </motion.button>
        </div>
      </div>

      {/* ── Document Library ── */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* Library header */}
        <div
          className="px-6 py-3 border-b flex items-center gap-3"
          style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-subtle)" }}
        >
          <div className="flex-1">
            <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              Document Library
              <span
                className="ml-2 px-1.5 py-0.5 rounded text-xs font-normal"
                style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)" }}
              >
                {filteredDocs.length}
              </span>
            </p>
          </div>

          {/* Search */}
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

          {/* Type filter */}
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
            <option value="json">JSON</option>
          </select>

          {/* Refresh */}
          <button
            onClick={() => void loadDocuments()}
            disabled={loadingDocs}
            style={{ color: "var(--text-muted)" }}
            title="Refresh"
          >
            <RefreshCw size={13} className={loadingDocs ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Column headers */}
        <div
          className="px-6 py-2 grid gap-4 border-b"
          style={{
            gridTemplateColumns: "1fr 160px 80px 60px 90px 80px 36px",
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-panel)",
          }}
        >
          {["File", "Doc ID", "Type", "Chunks", "Size", "Ingested", ""].map((h) => (
            <span key={h} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{h}</span>
          ))}
        </div>

        {/* Document rows */}
        <div className="flex-1 overflow-y-auto">
          {loadingDocs ? (
            <div className="flex items-center justify-center h-32 gap-2" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">Loading documents…</span>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3" style={{ color: "var(--text-muted)" }}>
              <FileText size={24} strokeWidth={1.5} />
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>No documents yet</p>
                <p className="text-xs mt-1">Upload a file to get started</p>
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filteredDocs.map((doc) => (
                <DocumentRow
                  key={doc.source_doc_id}
                  doc={doc}
                  onDelete={handleDelete}
                  onView={setViewingDoc}
                  deleting={deletingId === doc.source_doc_id}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Footer schema note */}
        {!isConnected && (
          <div
            className="px-6 py-2 border-t flex items-center gap-2"
            style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-panel)" }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#f97316" }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Demo mode — connect to Astra DB to persist documents
            </span>
          </div>
        )}

        <RawCollectionBrowser
          isConnected={isConnected}
          selectedCollection={selectedCollection}
          astraToken={astraToken}
          astraEndpoint={astraEndpoint}
          keyspace={keyspace}
        />
      </div>

      {/* Document viewer modal */}
      <AnimatePresence>
        {viewingDoc && (
          <DocumentViewer
            doc={viewingDoc}
            astraToken={astraToken}
            astraEndpoint={astraEndpoint}
            keyspace={keyspace}
            isConnected={isConnected}
            onClose={() => setViewingDoc(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── DocumentRow ──────────────────────────────────────────────────────────────

function DocumentRow({
  doc,
  onDelete,
  onView,
  deleting,
}: {
  doc: IngestedDocumentSummary;
  onDelete: (d: IngestedDocumentSummary) => void;
  onView: (d: IngestedDocumentSummary) => void;
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
      {/* Filename */}
      <div className="flex items-center gap-2.5 min-w-0">
        <FileIcon type={doc.file_type} size={14} />
        <span
          className="text-xs truncate"
          style={{ color: "var(--text-primary)", fontFamily: "IBM Plex Mono, monospace" }}
          title={doc.source_filename}
        >
          {doc.source_filename}
        </span>
        <ChevronRight size={11} style={{ color: "var(--text-muted)", opacity: hovered ? 1 : 0, flexShrink: 0, transition: "opacity 0.15s" }} />
      </div>

      {/* Doc ID */}
      <span
        className="text-xs font-mono truncate"
        style={{ color: "var(--text-muted)" }}
        title={doc.source_doc_id}
      >
        {doc.source_doc_id.length > 18 ? doc.source_doc_id.slice(0, 18) + "…" : doc.source_doc_id}
      </span>

      {/* Type */}
      <TypeBadge type={doc.file_type} />

      {/* Chunks */}
      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
        {doc.chunk_total} {doc.chunk_total === 1 ? "chunk" : "chunks"}
      </span>

      {/* Size */}
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {formatBytes(doc.file_size)}
      </span>

      {/* Date */}
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {formatDate(doc.ingested_at)}
      </span>

      {/* Actions */}
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
              {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
