"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  FileSpreadsheet,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";
import type { Collection } from "@/lib/types";

type IngestCodeLang = "ts" | "python" | "java" | "curl";

const INGEST_LANG_LABELS: Record<IngestCodeLang, string> = {
  ts: "TypeScript",
  python: "Python",
  java: "Java",
  curl: "cURL",
};
const INGEST_LANG_SDK: Record<IngestCodeLang, string> = {
  ts: "astra-db-ts",
  python: "astrapy",
  java: "astra-db-java",
  curl: "Data API",
};

function getIngestCode(lang: IngestCodeLang, collectionName: string): string {
  switch (lang) {
    case "ts":
      return `await db.collection("${collectionName}")\n  .insertMany(rows)`;
    case "python":
      return `collection.insert_many(rows)`;
    case "java":
      return `collection.insertMany(rows)`;
    case "curl":
      return `curl -X POST "$ASTRA_DB_API_ENDPOINT/api/json/v1/$KEYSPACE/${collectionName}" \\\n  -H "Token: $ASTRA_DB_APPLICATION_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"insertMany": {"documents": rows}}'`;
  }
}

function IngestCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={() => void handleCopy()}
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
      style={{
        color: copied ? "var(--step-respond)" : "var(--text-muted)",
        backgroundColor: copied ? "rgba(34,197,94,0.08)" : "transparent",
        border: `1px solid ${copied ? "rgba(34,197,94,0.2)" : "transparent"}`,
      }}
      title="Copy to clipboard"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function IngestCodePanel({ collectionName }: { collectionName: string }) {
  const [lang, setLang] = useState<IngestCodeLang>("ts");
  const code = getIngestCode(lang, collectionName);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
      {/* Language selector bar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-subtle)" }}
      >
        <div className="flex gap-0.5">
          {(Object.keys(INGEST_LANG_LABELS) as IngestCodeLang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
              style={{
                backgroundColor: lang === l ? "var(--interactive-light)" : "transparent",
                color: lang === l ? "var(--interactive)" : "var(--text-muted)",
                border: lang === l ? "1px solid var(--interactive-border)" : "1px solid transparent",
              }}
            >
              {INGEST_LANG_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}>
            {INGEST_LANG_SDK[lang]}
          </span>
          <IngestCopyButton text={code} />
        </div>
      </div>
      {/* Code block */}
      <div style={{ backgroundColor: "var(--bg-card)" }}>
        <pre
          className="text-[11px] px-3 py-2.5 overflow-x-auto leading-relaxed"
          style={{
            fontFamily: "IBM Plex Mono, monospace",
            color: "var(--text-secondary)",
            whiteSpace: "pre",
            margin: 0,
          }}
        >
          {code.split("\n").map((line, i) => (
            <span key={i}>
              {line
                .replace(/^(await )/, "⟨await⟩")
                .split(/(⟨await⟩|"[^"]*"|\$[A-Z_]+|\b(?:collection|db)\b|\.insertMany\b|\.insert_many\b|-[XHd]|curl\b)/g)
                .map((part, j) => {
                  if (part === "⟨await⟩") return <span key={j} style={{ color: "var(--interactive)" }}>await </span>;
                  if (part === "curl") return <span key={j} style={{ color: "var(--interactive)" }}>{part}</span>;
                  if (part === "-X" || part === "-H" || part === "-d") return <span key={j} style={{ color: "var(--text-muted)" }}>{part}</span>;
                  if (part.startsWith('"')) return <span key={j} style={{ color: "var(--step-respond)" }}>{part}</span>;
                  if (part.startsWith("$")) return <span key={j} style={{ color: "var(--step-embed)" }}>{part}</span>;
                  if (part === ".insertMany" || part === ".insert_many") return <span key={j} style={{ color: "var(--interactive)" }}>{part}</span>;
                  if (part === "collection" || part === "db") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
                  return <span key={j}>{part}</span>;
                })}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}

/** Simple CSV parser — handles quoted fields with embedded commas/newlines */
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "\n" && !inQuote) {
      lines.push(cur.trimEnd());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) lines.push(cur.trimEnd());

  const splitRow = (line: string): string[] => {
    const cells: string[] = [];
    let cell = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cell += '"'; i++; }
        else q = !q;
      } else if (ch === "," && !q) {
        cells.push(cell);
        cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell);
    return cells;
  };

  if (lines.length < 2) return [];
  const headers = splitRow(lines[0]);
  return lines.slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const vals = splitRow(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
      return row;
    });
}

interface IngestPanelProps {
  collections?: Collection[];
  astraToken?: string;
  astraEndpoint?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function IngestPanel({ collections, astraToken, astraEndpoint, collapsed: collapsedProp, onCollapsedChange }: IngestPanelProps) {
  // Filter out internal dap_ collections
  const displayCollections = (collections ?? []).filter((c) => !c.name.startsWith("dap_"));
  const isConnected = !!astraToken && !!astraEndpoint;

  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = (v: boolean) => {
    setCollapsedInternal(v);
    onCollapsedChange?.(v);
  };
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    rows: number;
    allRows: Record<string, string>[];
    preview: Record<string, string>[];
  } | null>(null);
  const [targetCollection, setTargetCollection] = useState(
    displayCollections[0]?.name ?? ""
  );
  const [showCollDropdown, setShowCollDropdown] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressRows, setProgressRows] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [ingestError, setIngestError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When connected collections change, keep targetCollection in sync
  const effectiveTarget = displayCollections.find((c) => c.name === targetCollection)
    ? targetCollection
    : displayCollections[0]?.name ?? targetCollection;

  const activeCollection = displayCollections.find((c) => c.name === effectiveTarget);
  const useVectorize = !!activeCollection?.vectorizeService;

  const handleFileDrop = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const allRows = parseCSV(text);
      setSelectedFile({
        name: file.name,
        rows: allRows.length,
        allRows,
        preview: allRows.slice(0, 3),
      });
      setIngestError("");
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileDrop(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileDrop(file);
  };

  const handleIngest = async () => {
    if (!selectedFile || ingesting) return;
    const rows = selectedFile.rows;
    setTotalRows(rows);
    setProgressRows(0);
    setProgress(0);
    setIngesting(true);
    setIngestError("");

    if (!isConnected) {
      // Mock ingest when not connected
      const step = rows / 30;
      let current = 0;
      const interval = setInterval(() => {
        current += step;
        if (current >= rows) {
          current = rows;
          setProgress(100);
          setProgressRows(rows);
          clearInterval(interval);
          setTimeout(() => {
            setIngesting(false);
            setSelectedFile(null);
            setProgress(0);
          }, 600);
        } else {
          setProgressRows(Math.floor(current));
          setProgress((current / rows) * 100);
        }
      }, 100);
      return;
    }

    // Real ingest via streaming API
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: astraToken,
          endpoint: astraEndpoint,
          collection: effectiveTarget,
          rows: selectedFile.allRows,
          filename: selectedFile.name,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Ingest failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const newline = buf.lastIndexOf("\n");
        if (newline === -1) continue;
        const lines = buf.slice(0, newline).split("\n");
        buf = buf.slice(newline + 1);

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as {
              type: string;
              processed?: number;
              total?: number;
              message?: string;
            };
            if (evt.type === "progress" || evt.type === "complete") {
              const p = evt.processed ?? 0;
              const t = evt.total ?? rows;
              setProgressRows(p);
              setTotalRows(t);
              setProgress(t > 0 ? (p / t) * 100 : 0);
            }
            if (evt.type === "complete") {
              setTimeout(() => {
                setIngesting(false);
                setSelectedFile(null);
                setProgress(0);
              }, 600);
            }
            if (evt.type === "error") {
              throw new Error(evt.message ?? "Ingest failed");
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : "Ingest failed");
      setIngesting(false);
    }
  };

  return (
    <motion.div
      animate={{ width: collapsed ? 40 : 320 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="shrink-0 flex flex-col border-l overflow-hidden"
      style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-subtle)" }}
    >
      {/* Collapse toggle */}
      <div className="shrink-0 border-b flex" style={{ borderColor: "var(--border-subtle)" }}>
        <motion.button
          onClick={() => setCollapsed(!collapsed)}
          className="flex-1 flex items-center justify-end gap-2 px-3 py-2.5 text-xs font-medium"
          style={{ color: "var(--text-muted)", backgroundColor: "rgba(0,0,0,0)" }}
          whileHover={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}
          whileTap={{ scale: 0.97 }}
          title={collapsed ? "Expand ingest panel" : "Collapse ingest panel"}
        >
          {!collapsed && <span>Collapse</span>}
          {collapsed ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
        </motion.button>
      </div>

      {/* Scrollable content */}
      {!collapsed && <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Panel title */}
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, rgba(0,194,203,0.2), rgba(108,99,255,0.2))", border: "1px solid rgba(0,194,203,0.3)" }}
          >
            <Database size={11} style={{ color: "var(--step-embed)" }} />
          </div>
          <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Ingest Data</span>
          <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>Upload CSV</span>
        </div>

        {/* Drop zone */}
        <AnimatePresence mode="wait">
          {!selectedFile ? (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center py-8 gap-3"
              style={{
                borderColor: isDragOver ? "var(--interactive)" : "var(--border-subtle)",
                backgroundColor: isDragOver ? "var(--interactive-light)" : "rgba(0,0,0,0)",
              }}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              whileHover={{ borderColor: "var(--interactive)", backgroundColor: "var(--interactive-light)" }}
            >
              <motion.div
                animate={isDragOver ? { scale: 1.1 } : { scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <UploadCloud size={28} style={{ color: isDragOver ? "var(--interactive)" : "var(--text-muted)" }} />
              </motion.div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  Drop a CSV file here
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  or click to browse
                </p>
              </div>
              <span
                className="text-[10px] px-2 py-1 rounded"
                style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-muted)" }}
              >
                .csv files only
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileInput}
              />
            </motion.div>
          ) : (
            <motion.div
              key="file-preview"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
            >
              {/* File info */}
              <div className="px-3 py-2.5 flex items-center gap-2.5">
                <FileSpreadsheet size={16} style={{ color: "var(--step-embed)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {selectedFile.rows.toLocaleString()} rows detected
                  </p>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-[11px] px-2 py-0.5 rounded transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "var(--text-primary)")}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "var(--text-muted)")}
                >
                  ✕
                </button>
              </div>

              {/* Preview table */}
              {selectedFile.preview.length > 0 && (
                <div className="overflow-x-auto" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ backgroundColor: "var(--bg-primary)" }}>
                        {Object.keys(selectedFile.preview[0]).slice(0, 4).map((key) => (
                          <th
                            key={key}
                            className="px-2 py-1.5 text-left font-medium uppercase tracking-wide"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedFile.preview.map((row, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          {Object.values(row).slice(0, 4).map((val, j) => (
                            <td
                              key={j}
                              className="px-2 py-1.5 truncate max-w-[80px]"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {val}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Code panel — shown when file is ready */}
        {selectedFile && <IngestCodePanel collectionName={effectiveTarget} />}

        {/* Collection selector */}
        <div className="relative">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
            Target Collection
            {!isConnected && (
              <span className="ml-1.5 normal-case" style={{ color: "var(--text-muted)" }}>(demo)</span>
            )}
          </p>
          <button
            onClick={() => setShowCollDropdown(!showCollDropdown)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm"
            style={{
              backgroundColor: "var(--bg-input)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          >
            <span>{effectiveTarget}</span>
            <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
          </button>

          <AnimatePresence>
            {showCollDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-50 shadow-xl"
                style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
              >
                {displayCollections.map((col) => (
                  <button
                    key={col.name}
                    onClick={() => { setTargetCollection(col.name); setShowCollDropdown(false); }}
                    className="w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors"
                    style={{
                      backgroundColor: col.name === effectiveTarget ? "var(--interactive-light)" : "transparent",
                      color: col.name === effectiveTarget ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = col.name === effectiveTarget ? "var(--interactive-light)" : "transparent")}
                  >
                    <span>{col.name}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Vectorize / embedding indicator */}
        {isConnected && activeCollection && (
          <div
            className="px-3 py-2.5 rounded-lg flex items-start gap-2"
            style={{
              backgroundColor: useVectorize ? "rgba(108,99,255,0.08)" : "rgba(0,194,203,0.06)",
              border: `1px solid ${useVectorize ? "rgba(108,99,255,0.25)" : "rgba(0,194,203,0.15)"}`,
            }}
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: useVectorize ? "var(--step-analyze)" : "var(--step-embed)" }}>
                {useVectorize ? "Server-side Vectorize" : "Client-side Embedding"}
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {useVectorize
                  ? `${activeCollection.vectorizeService!.provider} · ${activeCollection.vectorizeService!.modelName}`
                  : "IBM Granite · granite-embedding-125m-english · 768d"}
              </span>
            </div>
          </div>
        )}

        {/* Ingest button */}
        <motion.button
          onClick={() => void handleIngest()}
          disabled={!selectedFile || ingesting}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            backgroundColor: selectedFile && !ingesting ? "var(--interactive)" : "var(--bg-hover)",
            color: selectedFile && !ingesting ? "#fff" : "var(--text-muted)",
            cursor: selectedFile && !ingesting ? "pointer" : "not-allowed",
            boxShadow: selectedFile && !ingesting ? "0 2px 12px var(--interactive-border)" : "none",
          }}
          whileHover={selectedFile && !ingesting ? { scale: 1.01 } : {}}
          whileTap={selectedFile && !ingesting ? { scale: 0.98 } : {}}
        >
          {ingesting ? "Ingesting..." : isConnected ? "Start Ingestion" : "Start Ingestion (demo)"}
        </motion.button>

        {/* Error */}
        {ingestError && (
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
            style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <AlertCircle size={13} style={{ color: "#ef4444", marginTop: "1px", flexShrink: 0 }} />
            <span className="text-[12px] leading-relaxed" style={{ color: "#fca5a5" }}>{ingestError}</span>
          </div>
        )}

        {/* Progress */}
        <AnimatePresence>
          {ingesting && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div
                className="rounded-xl p-3"
                style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    Vectorizing rows...
                  </span>
                  <span className="text-xs" style={{ color: "var(--step-embed)" }}>
                    {progressRows.toLocaleString()} / {totalRows.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border-subtle)" }}>
                  <motion.div
                    className="h-full rounded-full progress-shimmer"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                  {useVectorize
                    ? `${activeCollection?.vectorizeService?.provider ?? "Vectorize"} · ${activeCollection?.vectorizeService?.modelName ?? "server-side"}`
                    : "IBM Granite · granite-embedding-125m-english · 768d"}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>}
    </motion.div>
  );
}
