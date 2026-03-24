"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  RefreshCw,
  Table2,
  Loader2,
  Trash2,
  Download,
} from "lucide-react";
import { PAGE_SIZE } from "@/lib/mock/data";
import type { Collection, CollectionDocument } from "@/lib/types";

interface CollectionViewerProps {
  collection: Collection;
  onSwitchToChat: () => void;
  astraToken?: string;
  astraEndpoint?: string;
  onCountChange?: (name: string, exactCount: number) => void;
  onOpenIngest?: () => void;
}

function getColumns(docs: CollectionDocument[]): string[] {
  const keys = new Set<string>();
  for (const doc of docs.slice(0, 5)) {
    for (const key of Object.keys(doc)) {
      keys.add(key);
    }
  }
  // Put _id first, $vector last
  const sorted = Array.from(keys).sort((a, b) => {
    if (a === "_id") return -1;
    if (b === "_id") return 1;
    if (a === "$vector") return 1;
    if (b === "$vector") return -1;
    return a.localeCompare(b);
  });
  return sorted;
}

function CellValue({ col, value }: { col: string; value: unknown }) {
  if (col === "$vector" && Array.isArray(value)) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
        style={{
          backgroundColor: "rgba(0, 194, 203, 0.1)",
          border: "1px solid rgba(0, 194, 203, 0.2)",
          color: "#00c2cb",
        }}
      >
        [{value.length} dims]
      </span>
    );
  }
  if (typeof value === "boolean") {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
        style={{
          backgroundColor: value ? "rgba(16, 185, 129, 0.12)" : "rgba(100, 116, 139, 0.12)",
          color: value ? "#10b981" : "#64748b",
        }}
      >
        {value ? "true" : "false"}
      </span>
    );
  }
  if (value === null || value === undefined) {
    return <span style={{ color: "#475569" }}>null</span>;
  }
  const str = String(value);
  return (
    <span
      className="truncate max-w-[180px] inline-block align-bottom"
      title={str}
      style={{ color: "#e2e8f0" }}
    >
      {str}
    </span>
  );
}

type CodeLang = "ts" | "python" | "java";

function BrowseCodeHint({ collectionName, sort }: {
  collectionName: string;
  sort: { col: string; dir: 1 | -1 } | null;
}) {
  const [lang, setLang] = useState<CodeLang>("ts");

  return (
    <div
      className="hidden lg:flex flex-col rounded-lg overflow-hidden text-[11px]"
      style={{ backgroundColor: "rgba(11,15,26,0.8)", border: "1px solid #1e2d4a", fontFamily: "JetBrains Mono, monospace" }}
    >
      {/* Language toggle */}
      <div className="flex items-center justify-between px-2 pt-1 pb-0.5">
        <span style={{ color: "#475569" }}>{{ ts: "astra-db-ts", python: "astrapy", java: "astra-db-java" }[lang]}</span>
        <div className="flex gap-0.5">
          {(["ts", "python", "java"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: lang === l ? "rgba(0,194,203,0.15)" : "transparent",
                color: lang === l ? "#00c2cb" : "#475569",
                border: lang === l ? "1px solid rgba(0,194,203,0.25)" : "1px solid transparent",
              }}
            >
              {{ ts: "TS", python: "Py", java: "Java" }[l]}
            </button>
          ))}
        </div>
      </div>
      {/* Code */}
      <div className="flex items-center gap-0.5 px-2 pb-1.5 overflow-x-auto" style={{ whiteSpace: "nowrap" }}>
        {lang === "ts" && <>
          <span style={{ color: "#6c63ff" }}>db</span>
          <span style={{ color: "#94a3b8" }}>.</span>
          <span style={{ color: "#00c2cb" }}>collection</span>
          <span style={{ color: "#94a3b8" }}>(</span>
          <span style={{ color: "#ff6b35" }}>&quot;{collectionName}&quot;</span>
          <span style={{ color: "#94a3b8" }}>).</span>
          <span style={{ color: "#00c2cb" }}>find</span>
          <span style={{ color: "#94a3b8" }}>(&#123;&#125;</span>
          {sort && <>
            <span style={{ color: "#94a3b8" }}>, &#123; sort: &#123; </span>
            <span style={{ color: "#ff6b35" }}>&quot;{sort.col}&quot;</span>
            <span style={{ color: "#94a3b8" }}>: </span>
            <span style={{ color: "#818cf8" }}>{sort.dir}</span>
            <span style={{ color: "#94a3b8" }}> &#125; &#125;</span>
          </>}
          <span style={{ color: "#94a3b8" }}>)</span>
        </>}
        {lang === "python" && <>
          <span style={{ color: "#6c63ff" }}>collection</span>
          <span style={{ color: "#94a3b8" }}>.</span>
          <span style={{ color: "#00c2cb" }}>find</span>
          <span style={{ color: "#94a3b8" }}>(&#123;&#125;</span>
          {sort && <>
            <span style={{ color: "#94a3b8" }}>, sort=&#123;</span>
            <span style={{ color: "#ff6b35" }}>&quot;{sort.col}&quot;</span>
            <span style={{ color: "#94a3b8" }}>: SortDocuments.</span>
            <span style={{ color: "#818cf8" }}>{sort.dir === 1 ? "ASCENDING" : "DESCENDING"}</span>
            <span style={{ color: "#94a3b8" }}>&#125;</span>
          </>}
          <span style={{ color: "#94a3b8" }}>)</span>
        </>}
        {lang === "java" && <>
          <span style={{ color: "#6c63ff" }}>collection</span>
          <span style={{ color: "#94a3b8" }}>.</span>
          <span style={{ color: "#00c2cb" }}>find</span>
          <span style={{ color: "#94a3b8" }}>(Filter.empty()</span>
          {sort && <>
            <span style={{ color: "#94a3b8" }}>, new FindOptions().sort(Sorts.</span>
            <span style={{ color: "#ff6b35" }}>{sort.dir === 1 ? "ascending" : "descending"}</span>
            <span style={{ color: "#94a3b8" }}>(</span>
            <span style={{ color: "#818cf8" }}>&quot;{sort.col}&quot;</span>
            <span style={{ color: "#94a3b8" }}>))</span>
          </>}
          <span style={{ color: "#94a3b8" }}>)</span>
        </>}
      </div>
    </div>
  );
}

function ExpandedRow({
  doc,
  colSpan,
}: {
  doc: CollectionDocument;
  colSpan: number;
}) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div
            className="px-6 py-4 mx-4 my-2 rounded-lg"
            style={{ backgroundColor: "rgba(11, 15, 26, 0.7)", border: "1px solid #1e2d4a" }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "#64748b" }}
            >
              Full Document
            </p>
            <pre
              className="text-[12px] leading-relaxed overflow-x-auto"
              style={{ color: "#7dd3fc", fontFamily: "JetBrains Mono, monospace" }}
            >
              {JSON.stringify(
                {
                  ...doc,
                  ...(doc.$vector
                    ? { $vector: `[${(doc.$vector as number[]).length} floats — truncated]` }
                    : {}),
                },
                null,
                2
              )}
            </pre>
          </div>
        </motion.div>
      </td>
    </tr>
  );
}

export function CollectionViewer({ collection, onSwitchToChat, astraToken, astraEndpoint, onCountChange, onOpenIngest }: CollectionViewerProps) {
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Real data state
  const isConnected = !!(astraToken && astraEndpoint);
  const [realDocs, setRealDocs] = useState<CollectionDocument[]>([]);
  const [pageStates, setPageStates] = useState<(string | null)[]>([null]); // index = page, value = pageState to fetch it
  const [nextPageState, setNextPageState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const fetchCount = useCallback(() => {
    if (!astraToken || !astraEndpoint) return;
    void fetch("/api/count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: astraToken, endpoint: astraEndpoint, collection: collection.name }),
    })
      .then((r) => r.json() as Promise<{ count?: number; error?: string }>)
      .then((data) => { if (data.count !== undefined) onCountChange?.(collection.name, data.count); })
      .catch(() => { /* silent — count is best-effort */ });
  }, [astraToken, astraEndpoint, collection.name, onCountChange]);

  const fetchPage = useCallback(async (pageIndex: number, pageStateForIndex: string | null, currentSort: typeof sort) => {
    if (!astraToken || !astraEndpoint) return;
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: astraToken,
          endpoint: astraEndpoint,
          collection: collection.name,
          pageState: pageStateForIndex ?? undefined,
          sort: currentSort ?? undefined,
        }),
      });
      const data = await res.json() as { documents?: CollectionDocument[]; nextPageState?: string | null; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to fetch");
      const docs = (data.documents ?? []).map((d) => {
        // Restore $vector placeholder into a typed array stub
        if (typeof d.$vector === "string" && (d.$vector as string).startsWith("__vector_")) {
          const dims = parseInt((d.$vector as string).replace("__vector_", "").replace("__", ""), 10);
          return { ...d, $vector: new Array(dims).fill(0) };
        }
        return d;
      });
      setRealDocs(docs);
      setNextPageState(data.nextPageState ?? null);
      // Store the next page's state so we can navigate forward
      setPageStates((prev) => {
        const updated = [...prev];
        updated[pageIndex + 1] = data.nextPageState ?? null;
        return updated;
      });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error fetching documents");
    } finally {
      setLoading(false);
    }
  }, [astraToken, astraEndpoint, collection.name]);

  // Fetch on mount / collection change
  useEffect(() => {
    if (!isConnected) return;
    setPage(0);
    setPageStates([null]);
    setNextPageState(null);
    setSelectedIds(new Set());
    setRealDocs([]);
    setLoading(true);
    void fetchPage(0, null, sort);
    fetchCount();
  }, [collection.name, isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSortColumn = (col: string) => {
    if (col === "$vector") return;
    const newSort = (() => {
      if (sort?.col !== col) return { col, dir: 1 as const };
      if (sort.dir === 1) return { col, dir: -1 as const };
      return null;
    })();
    setSort(newSort);
    setPage(0);
    setPageStates([null]);
    setNextPageState(null);
    setExpandedId(null);
    void fetchPage(0, null, newSort);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    void fetchPage(page, pageStates[page] ?? null, sort).finally(() => setIsRefreshing(false));
  };

  const handlePageChange = (newPage: number) => {
    setExpandedId(null);
    setSelectedIds(new Set());
    setPage(newPage);
    void fetchPage(newPage, pageStates[newPage] ?? null, sort);
  };

  const displayDocs = realDocs;

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.size === displayDocs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayDocs.map((d) => d._id)));
    }
  };

  const handleDelete = async () => {
    if (!isConnected || selectedIds.size === 0 || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/delete-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: astraToken,
          endpoint: astraEndpoint,
          collection: collection.name,
          ids: Array.from(selectedIds),
        }),
      });
      const data = await res.json() as { deletedCount?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Delete failed");
      setSelectedIds(new Set());
      await fetchPage(page, pageStates[page] ?? null, sort);
      fetchCount();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };
  const handleExport = () => {
    if (displayDocs.length === 0) return;
    const exportCols = columns.filter((c) => c !== "$vector");
    const header = exportCols.join(",");
    const rows = displayDocs.map((doc) =>
      exportCols.map((col) => {
        const val = doc[col];
        if (val === undefined || val === null) return "";
        const str = typeof val === "object" ? JSON.stringify(val) : String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${collection.name}_page${page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const availablePages = nextPageState ? page + 2 : page + 1;
  const columns = useMemo(() => getColumns(realDocs), [realDocs]);
  const startRow = page * PAGE_SIZE + 1;
  const endRow = page * PAGE_SIZE + displayDocs.length;

  const isLastKnownPage = !nextPageState;
  const knownTotal = collection.count > 0 ? collection.count : null;
  const inferredTotal = isLastKnownPage ? endRow : knownTotal;
  const totalPages = availablePages;

  return (
    <motion.div
      key={collection.name}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col min-h-0 overflow-hidden"
      style={{ backgroundColor: "#0b0f1a" }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 border-b shrink-0 flex items-center justify-between"
        style={{ borderColor: "#1e2d4a", backgroundColor: "#0d1220" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(255,107,53,0.2), rgba(108,99,255,0.2))",
              border: "1px solid rgba(255, 107, 53, 0.3)",
            }}
          >
            <Table2 size={15} style={{ color: "#ff6b35" }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2
                className="text-base font-semibold"
                style={{ color: "#f8fafc", fontFamily: "JetBrains Mono, monospace" }}
              >
                {collection.name}
              </h2>
              {collection.vectorDim && (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "rgba(0, 194, 203, 0.1)",
                    border: "1px solid rgba(0, 194, 203, 0.2)",
                    color: "#00c2cb",
                  }}
                >
                  {collection.vectorDim}d
                </span>
              )}
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: "#64748b" }}>
              {inferredTotal !== null ? `${inferredTotal.toLocaleString()}${!isLastKnownPage && !knownTotal ? "+" : ""} documents` : "documents"}
            </p>
          </div>
        </div>

        {/* Code hint + actions */}
        <div className="flex items-center gap-3">
          <BrowseCodeHint collectionName={collection.name} sort={sort} />

          <motion.button
            onClick={handleRefresh}
            className="p-2 rounded-lg"
            style={{ color: "#64748b" }}
            whileHover={{ backgroundColor: "rgba(30, 45, 74, 0.8)", color: "#f8fafc" }}
            whileTap={{ scale: 0.9 }}
            title="Refresh"
          >
            <motion.div
              animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
              transition={isRefreshing ? { duration: 0.6, ease: "linear" } : {}}
            >
              <RefreshCw size={14} />
            </motion.div>
          </motion.button>

          <motion.button
            onClick={handleExport}
            disabled={displayDocs.length === 0}
            className="p-2 rounded-lg"
            style={{ color: displayDocs.length > 0 ? "#64748b" : "#2a3a5a" }}
            whileHover={displayDocs.length > 0 ? { backgroundColor: "rgba(30, 45, 74, 0.8)", color: "#f8fafc" } : {}}
            whileTap={displayDocs.length > 0 ? { scale: 0.9 } : {}}
            title="Export current page as CSV"
          >
            <Download size={14} />
          </motion.button>

          <motion.button
            onClick={onSwitchToChat}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: "rgba(108, 99, 255, 0.12)",
              border: "1px solid rgba(108, 99, 255, 0.3)",
              color: "#6c63ff",
            }}
            whileHover={{
              backgroundColor: "rgba(108, 99, 255, 0.2)",
              borderColor: "rgba(108, 99, 255, 0.5)",
            }}
            whileTap={{ scale: 0.97 }}
          >
            <MessageSquare size={13} />
            <span>Ask about this data</span>
          </motion.button>
        </div>
      </div>

      {/* Selection toolbar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden shrink-0"
          >
            <div className="flex items-center justify-between px-6 py-2 border-b"
              style={{ backgroundColor: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.2)" }}>
              <span className="text-xs font-medium" style={{ color: "#fca5a5" }}>
                {selectedIds.size} document{selectedIds.size !== 1 ? "s" : ""} selected
              </span>
              <div className="flex items-center gap-2">
                {deleteError && (
                  <span className="text-xs" style={{ color: "#f87171" }}>{deleteError}</span>
                )}
                <motion.button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1 rounded-lg text-xs font-medium"
                  style={{ color: "#64748b", border: "1px solid #1e2d4a" }}
                  whileHover={{ backgroundColor: "rgba(30,45,74,0.6)", color: "#f8fafc" }}
                  whileTap={{ scale: 0.97 }}
                >
                  Clear
                </motion.button>
                <motion.button
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold"
                  style={{
                    backgroundColor: deleting ? "#1e2d4a" : "rgba(239,68,68,0.15)",
                    border: "1px solid rgba(239,68,68,0.4)",
                    color: deleting ? "#64748b" : "#f87171",
                    cursor: deleting ? "not-allowed" : "pointer",
                  }}
                  whileHover={!deleting ? { backgroundColor: "rgba(239,68,68,0.25)" } : {}}
                  whileTap={!deleting ? { scale: 0.97 } : {}}
                >
                  {deleting
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Trash2 size={12} />}
                  {deleting ? "Deleting…" : `Delete ${selectedIds.size}`}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <div className="flex-1 overflow-auto relative">
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: "rgba(11,15,26,0.6)" }}>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ backgroundColor: "#0d1220", border: "1px solid #1e2d4a" }}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                <Loader2 size={14} style={{ color: "#00c2cb" }} />
              </motion.div>
              <span className="text-[12px]" style={{ color: "#94a3b8" }}>Loading…</span>
            </div>
          </div>
        )}
        {fetchError && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: "rgba(11,15,26,0.85)" }}>
            <div className="text-center px-6">
              <p className="text-sm font-medium mb-1" style={{ color: "#fca5a5" }}>Failed to load documents</p>
              <p className="text-[12px]" style={{ color: "#64748b" }}>{fetchError}</p>
            </div>
          </div>
        )}
        {!loading && !fetchError && displayDocs.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-5 text-center px-8 py-10 rounded-2xl max-w-sm"
              style={{ backgroundColor: "#0d1220", border: "1px solid #1e2d4a", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(0,194,203,0.12), rgba(108,99,255,0.12))", border: "1px solid rgba(0,194,203,0.2)" }}
              >
                <Table2 size={22} style={{ color: "#00c2cb" }} />
              </div>
              <div>
                <h3 className="text-base font-semibold mb-1.5" style={{ color: "#f8fafc" }}>
                  No documents yet
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                  This collection is empty. Ingest a CSV file to add documents.
                </p>
              </div>
              {onOpenIngest && (
                <motion.button
                  onClick={onOpenIngest}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                  style={{
                    background: "linear-gradient(135deg, #00c2cb, #0099a3)",
                    color: "#fff",
                    boxShadow: "0 2px 16px rgba(0,194,203,0.25)",
                  }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  Open Ingest Panel →
                </motion.button>
              )}
            </motion.div>
          </div>
        )}
        {!loading && !fetchError && displayDocs.length === 0 ? null : <table className="w-full border-collapse" style={{ minWidth: "600px" }}>
          <thead>
            <tr style={{ backgroundColor: "#0d1220", borderBottom: "1px solid #1e2d4a" }}>
              {/* Checkbox select-all */}
              <th className="w-10 px-3 py-3" onClick={handleSelectAll} style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  readOnly
                  checked={displayDocs.length > 0 && selectedIds.size === displayDocs.length}
                  ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < displayDocs.length; }}
                  className="cursor-pointer"
                  style={{ accentColor: "#ff6b35" }}
                />
              </th>
              {/* Expand toggle column */}
              <th className="w-8 px-3 py-3" />
              {columns.map((col) => {
                const isSorted = sort?.col === col;
                const isSortable = col !== "$vector";
                return (
                  <th
                    key={col}
                    onClick={() => isSortable && handleSortColumn(col)}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap select-none"
                    style={{
                      color: isSorted ? "#f8fafc" : col === "_id" ? "#ff6b35" : col === "$vector" ? "#00c2cb" : "#64748b",
                      borderBottom: `1px solid ${isSorted ? "rgba(255,107,53,0.4)" : "#1e2d4a"}`,
                      fontFamily: col === "_id" || col === "$vector" ? "JetBrains Mono, monospace" : undefined,
                      cursor: isSortable ? "pointer" : "default",
                      backgroundColor: isSorted ? "rgba(255,107,53,0.06)" : undefined,
                      transition: "color 0.15s, background-color 0.15s",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col}</span>
                      {isSortable && (
                        isSorted ? (
                          sort.dir === 1
                            ? <ArrowUp size={11} style={{ color: "#ff6b35" }} />
                            : <ArrowDown size={11} style={{ color: "#ff6b35" }} />
                        ) : (
                          <ChevronsUpDown size={10} style={{ color: "#334155", opacity: 0 }} className="group-hover:opacity-100" />
                        )
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayDocs.map((doc, i) => {
              const isExpanded = expandedId === doc._id;
              return (
                <React.Fragment key={doc._id}>
                  <motion.tr
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15, delay: i * 0.03 }}
                    onClick={() => setExpandedId(isExpanded ? null : doc._id)}
                    className="cursor-pointer group"
                    style={{
                      borderBottom: isExpanded ? "none" : "1px solid rgba(30, 45, 74, 0.5)",
                      backgroundColor: selectedIds.has(doc._id)
                        ? "rgba(239,68,68,0.05)"
                        : isExpanded
                        ? "rgba(255, 107, 53, 0.05)"
                        : i % 2 === 0
                        ? "transparent"
                        : "rgba(13, 18, 32, 0.4)",
                    }}
                    whileHover={{ backgroundColor: selectedIds.has(doc._id) ? "rgba(239,68,68,0.08)" : "rgba(255, 107, 53, 0.04)" }}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-3 w-10" onClick={(e) => handleToggleSelect(doc._id, e)}>
                      <input
                        type="checkbox"
                        readOnly
                        checked={selectedIds.has(doc._id)}
                        className="cursor-pointer"
                        style={{ accentColor: "#ef4444" }}
                      />
                    </td>
                    {/* Expand chevron */}
                    <td className="px-3 py-3 w-8">
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown size={13} style={{ color: "#475569" }} />
                      </motion.div>
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="px-4 py-3 text-sm max-w-[220px]"
                        style={{
                          fontFamily: col === "_id" ? "JetBrains Mono, monospace" : undefined,
                          fontSize: col === "_id" ? "11px" : undefined,
                          color: col === "_id" ? "#94a3b8" : undefined,
                        }}
                      >
                        <CellValue col={col} value={doc[col]} />
                      </td>
                    ))}
                  </motion.tr>
                  <AnimatePresence>
                    {isExpanded && (
                      <ExpandedRow
                        key={`${doc._id}-expanded`}
                        doc={doc}
                        colSpan={columns.length + 2}
                      />
                    )}
                  </AnimatePresence>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>}
      </div>

      {/* Pagination footer */}
      <div
        className="px-6 py-3 border-t shrink-0 flex items-center justify-between"
        style={{ borderColor: "#1e2d4a", backgroundColor: "#0d1220" }}
      >
        <p className="text-[12px]" style={{ color: "#64748b" }}>
          Showing{" "}
          <span style={{ color: "#f8fafc" }}>{startRow.toLocaleString()}–{endRow.toLocaleString()}</span>
          {inferredTotal !== null ? (
            <>{" "}of{" "}<span style={{ color: "#f8fafc" }}>{inferredTotal.toLocaleString()}{!isLastKnownPage && !knownTotal ? "+" : ""}</span></>
          ) : null}
          {" "}documents
        </p>

        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "#475569" }}>
            Page {page + 1}{totalPages > 1 ? ` of ${totalPages.toLocaleString()}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <motion.button
              onClick={() => handlePageChange(Math.max(0, page - 1))}
              disabled={page === 0 || loading}
              className="p-1.5 rounded-lg"
              style={{ color: page === 0 || loading ? "#334155" : "#64748b", cursor: page === 0 || loading ? "not-allowed" : "pointer" }}
              whileHover={page > 0 && !loading ? { backgroundColor: "rgba(30, 45, 74, 0.8)", color: "#f8fafc" } : {}}
              whileTap={page > 0 && !loading ? { scale: 0.9 } : {}}
            >
              <ChevronLeft size={15} />
            </motion.button>
            <motion.button
              onClick={() => handlePageChange(Math.min(availablePages - 1, page + 1))}
              disabled={page >= availablePages - 1 || loading}
              className="p-1.5 rounded-lg"
              style={{ color: page >= availablePages - 1 || loading ? "#334155" : "#64748b", cursor: page >= availablePages - 1 || loading ? "not-allowed" : "pointer" }}
              whileHover={page < availablePages - 1 && !loading ? { backgroundColor: "rgba(30, 45, 74, 0.8)", color: "#f8fafc" } : {}}
              whileTap={page < availablePages - 1 && !loading ? { scale: 0.9 } : {}}
            >
              <ChevronRight size={15} />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
