"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  FileCode,
  Table,
  Braces,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  X,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Database,
} from "lucide-react";
import type { Collection, IngestFileType, IngestedDocumentSummary } from "@/lib/types";
import { mockIngestedDocuments } from "@/lib/mock/data";

// ── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED = ".pdf,.txt,.md,.csv,.json,.docx";
const ACCEPTED_LABEL = "PDF · TXT · MD · DOCX · CSV · JSON";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getFileType(filename: string): IngestFileType {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "txt";
  return (["pdf", "txt", "md", "csv", "json", "docx"].includes(ext) ? ext : "txt") as IngestFileType;
}

function FileIcon({ type, size = 14 }: { type: IngestFileType; size?: number }) {
  const props = { size, strokeWidth: 1.75 };
  switch (type) {
    case "pdf":   return <FileText {...props} style={{ color: "#ef4444" }} />;
    case "docx":  return <FileText {...props} style={{ color: "#3b82f6" }} />;
    case "md":    return <FileCode {...props} style={{ color: "#22c55e" }} />;
    case "csv":   return <Table {...props} style={{ color: "#f97316" }} />;
    case "json":  return <Braces {...props} style={{ color: "#a855f7" }} />;
    default:      return <FileText {...props} style={{ color: "var(--text-muted)" }} />;
  }
}

function TypeBadge({ type }: { type: IngestFileType }) {
  const colors: Record<IngestFileType, string> = {
    pdf:  "#ef444420",
    docx: "#3b82f620",
    md:   "#22c55e20",
    csv:  "#f9731620",
    json: "#a855f720",
    txt:  "var(--bg-card)",
  };
  const text: Record<IngestFileType, string> = {
    pdf: "#ef4444", docx: "#3b82f6", md: "#22c55e",
    csv: "#f97316", json: "#a855f7", txt: "var(--text-muted)",
  };
  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs font-mono font-medium uppercase"
      style={{ backgroundColor: colors[type], color: text[type] }}
    >
      {type}
    </span>
  );
}

// ── Per-file status ───────────────────────────────────────────────────────────

type FileStatus =
  | { stage: "queued" }
  | { stage: "extracting" }
  | { stage: "storing"; processed: number; total: number }
  | { stage: "done"; chunks: number }
  | { stage: "error"; message: string };

function fileKey(f: File) { return `${f.name}__${f.size}`; }

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
  }, [activeCollection]);
  const [uploading, setUploading] = useState(false);

  // Library state
  const [documents, setDocuments] = useState<IngestedDocumentSummary[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<IngestFileType | "all">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<IngestedDocumentSummary | null>(null);

  // Raw collection state
  const [rawOpen, setRawOpen] = useState(false);
  const [rawDocs, setRawDocs] = useState<Record<string, unknown>[]>([]);
  const [loadingRaw, setLoadingRaw] = useState(false);
  const [rawError, setRawError] = useState("");
  const [rawPageState, setRawPageState] = useState<string | null>(null);
  const [rawPageHistory, setRawPageHistory] = useState<(string | null)[]>([null]);
  const [rawPageIndex, setRawPageIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load documents ──────────────────────────────────────────────────────

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    if (!isConnected) {
      setDocuments(mockIngestedDocuments.filter((d) => d.collection === selectedCollection));
      setLoadingDocs(false);
      return;
    }
    try {
      const params = new URLSearchParams({
        collection: selectedCollection,
        token: astraToken,
        endpoint: astraEndpoint,
        keyspace,
      });
      const res = await fetch(`/api/documents?${params}`);
      const data = await res.json() as { documents?: IngestedDocumentSummary[] };
      setDocuments(data.documents ?? []);
    } catch {
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  }, [isConnected, selectedCollection, astraToken, astraEndpoint, keyspace]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const loadRawDocs = useCallback(async (pageState: string | null) => {
    if (!isConnected) return;
    setLoadingRaw(true);
    setRawError("");
    try {
      const res = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: astraToken, endpoint: astraEndpoint, collection: selectedCollection, pageState }),
      });
      const data = await res.json() as { documents?: Record<string, unknown>[]; nextPageState?: string | null; error?: string };
      if (data.error) throw new Error(data.error);
      setRawDocs(data.documents ?? []);
      setRawPageState(data.nextPageState ?? null);
    } catch (e) {
      setRawError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoadingRaw(false);
    }
  }, [isConnected, selectedCollection, astraToken, astraEndpoint]);

  // Load raw docs when panel is opened or collection changes
  useEffect(() => {
    if (rawOpen && isConnected) {
      setRawPageHistory([null]);
      setRawPageIndex(0);
      void loadRawDocs(null);
    }
  }, [rawOpen, selectedCollection, isConnected]);

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
            setDocuments((prev) => [newDoc, ...prev]);
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

  // ── Delete ──────────────────────────────────────────────────────────────

  async function handleDelete(doc: IngestedDocumentSummary) {
    setDeletingId(doc.source_doc_id);
    try {
      if (isConnected) {
        await fetch("/api/documents", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_doc_id: doc.source_doc_id,
            collection: doc.collection,
            token: astraToken,
            endpoint: astraEndpoint,
            keyspace,
          }),
        });
      }
      setDocuments((prev) => prev.filter((d) => d.source_doc_id !== doc.source_doc_id));
    } finally {
      setDeletingId(null);
    }
  }

  // ── Filtered documents ───────────────────────────────────────────────────

  const filteredDocs = documents.filter((d) => {
    const matchesSearch = !search || d.source_filename.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || d.file_type === filterType;
    return matchesSearch && matchesType;
  });


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

        {/* ── Raw Collection Viewer ── */}
        <div className="border-t shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
          {/* Toggle header */}
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
              {selectedCollection}
            </span>
            {rawOpen
              ? <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
              : <ChevronRight size={13} style={{ color: "var(--text-muted)" }} />
            }
          </button>

          {/* Content */}
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
                {/* Pagination bar */}
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
                    onClick={() => {
                      const prevIdx = rawPageIndex - 1;
                      const prevPage = rawPageHistory[prevIdx] ?? null;
                      setRawPageIndex(prevIdx);
                      void loadRawDocs(prevPage);
                    }}
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
                    onClick={() => {
                      const nextIdx = rawPageIndex + 1;
                      const newHistory = [...rawPageHistory];
                      if (!newHistory[nextIdx]) newHistory[nextIdx] = rawPageState;
                      setRawPageHistory(newHistory);
                      setRawPageIndex(nextIdx);
                      void loadRawDocs(rawPageState);
                    }}
                  >
                    Next →
                  </button>
                  <button
                    onClick={() => { setRawPageHistory([null]); setRawPageIndex(0); void loadRawDocs(null); }}
                    disabled={loadingRaw}
                    style={{ color: "var(--text-muted)" }}
                    title="Refresh"
                  >
                    <RefreshCw size={12} className={loadingRaw ? "animate-spin" : ""} />
                  </button>
                </div>

                {/* Document rows */}
                <div className="flex-1 overflow-y-auto">
                  {!isConnected ? (
                    <div className="flex items-center justify-center h-full" style={{ color: "var(--text-muted)" }}>
                      <span className="text-xs">Connect to Astra DB to browse raw documents</span>
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

// ── RawDocRow ─────────────────────────────────────────────────────────────────

const SYSTEM_KEYS = new Set(["$vector", "$vectorize", "$similarity"]);

function RawDocRow({ doc }: { doc: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
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
      {/* Row summary */}
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

      {/* Expanded fields */}
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
                  <span
                    className="flex-1 font-mono break-all"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {typeof v === "string" ? v : JSON.stringify(v)}
                  </span>
                </div>
              ))}
              {vectorStr && (
                <div
                  className="flex gap-3 px-3 py-1.5 text-xs"
                  style={{ backgroundColor: "#a855f710" }}
                >
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

// ── DocumentViewer ────────────────────────────────────────────────────────────

function DocumentViewer({
  doc,
  astraToken,
  astraEndpoint,
  keyspace,
  isConnected,
  onClose,
}: {
  doc: IngestedDocumentSummary;
  astraToken: string;
  astraEndpoint: string;
  keyspace: string;
  isConnected: boolean;
  onClose: () => void;
}) {
  const [chunks, setChunks] = useState<Array<{ chunk_index: number; content: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isConnected) { setLoading(false); return; }

    const params = new URLSearchParams({
      source_doc_id: doc.source_doc_id,
      collection: doc.collection,
      token: astraToken,
      endpoint: astraEndpoint,
      keyspace,
    });

    fetch(`/api/documents/chunks?${params}`)
      .then((r) => r.json() as Promise<{ chunks?: typeof chunks; error?: string }>)
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setChunks(data.chunks ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [doc, astraToken, astraEndpoint, keyspace, isConnected]);

  const fullText = chunks.map((c) => c.content).join("\n\n");

  function handleCopy() {
    void navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Close on Escape
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
        {/* Header */}
        <div
          className="flex items-center gap-3 px-6 py-4 border-b shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <FileIcon type={doc.file_type} size={16} />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-medium truncate"
              style={{ color: "var(--text-primary)", fontFamily: "IBM Plex Mono, monospace" }}
            >
              {doc.source_filename}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {doc.chunk_total} {doc.chunk_total === 1 ? "chunk" : "chunks"} · {formatBytes(doc.file_size)} · {formatDate(doc.ingested_at)}
            </p>
          </div>

          {/* Copy button */}
          {chunks.length > 0 && (
            <motion.button
              onClick={handleCopy}
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

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg"
            style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-card)" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2" style={{ color: "var(--text-muted)" }}>
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading chunks…</span>
            </div>
          ) : !isConnected ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3" style={{ color: "var(--text-muted)" }}>
              <AlertCircle size={20} strokeWidth={1.5} />
              <p className="text-sm">Connect to Astra DB to view document content</p>
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
                  {/* Chunk label */}
                  <div className="flex items-center gap-2 mb-2 sticky top-0 py-1" style={{ backgroundColor: "var(--bg-panel)" }}>
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded"
                      style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
                    >
                      chunk {chunk.chunk_index + 1} / {doc.chunk_total}
                    </span>
                  </div>
                  {/* Chunk text */}
                  <pre
                    className="text-sm leading-relaxed whitespace-pre-wrap font-sans mb-4"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {chunk.content}
                  </pre>
                  {/* Divider between chunks */}
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
