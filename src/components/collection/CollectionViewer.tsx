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
  Code2,
  Loader2,
  Trash2,
  Download,
  Copy,
  Check,
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
          color: "var(--step-embed)",
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
          backgroundColor: value ? "rgba(34, 197, 94, 0.12)" : "var(--bg-hover)",
          color: value ? "var(--step-respond)" : "var(--text-muted)",
        }}
      >
        {value ? "true" : "false"}
      </span>
    );
  }
  if (value === null || value === undefined) {
    return <span style={{ color: "var(--text-muted)" }}>null</span>;
  }
  const str = String(value);
  return (
    <span
      className="truncate max-w-[180px] inline-block align-bottom"
      title={str}
      style={{ color: "var(--text-primary)" }}
    >
      {str}
    </span>
  );
}

type BrowseCodeLang = "ts" | "python" | "java" | "curl";

const BROWSE_LANG_LABELS: Record<BrowseCodeLang, string> = {
  ts: "TypeScript",
  python: "Python",
  java: "Java",
  curl: "cURL",
};
const BROWSE_LANG_SDK: Record<BrowseCodeLang, string> = {
  ts: "astra-db-ts",
  python: "astrapy",
  java: "astra-db-java",
  curl: "Data API",
};

function getBrowseCode(lang: BrowseCodeLang, collectionName: string, sort: { col: string; dir: 1 | -1 } | null): string {
  switch (lang) {
    case "ts":
      return sort
        ? `await db.collection("${collectionName}")\n  .find({}, { sort: { "${sort.col}": ${sort.dir} } })\n  .toArray()`
        : `await db.collection("${collectionName}")\n  .find({})\n  .toArray()`;
    case "python":
      return sort
        ? `from astrapy.constants import SortDocuments\ncollection.find(\n    {},\n    sort={"${sort.col}": SortDocuments.${sort.dir === 1 ? "ASCENDING" : "DESCENDING"}}\n)`
        : `collection.find({})`;
    case "java":
      return sort
        ? `collection.find(\n    Filter.empty(),\n    new FindOptions()\n        .sort(Sorts.${sort.dir === 1 ? "ascending" : "descending"}("${sort.col}"))\n)`
        : `collection.find(Filter.empty())`;
    case "curl": {
      const body = sort
        ? JSON.stringify({ find: { filter: {}, sort: { [sort.col]: sort.dir } } }, null, 2)
        : JSON.stringify({ find: { filter: {} } }, null, 2);
      return `curl -X POST "$ASTRA_DB_API_ENDPOINT/api/json/v1/$KEYSPACE/${collectionName}" \\\n  -H "Token: $ASTRA_DB_APPLICATION_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
    }
  }
}

function BrowseCopyButton({ text }: { text: string }) {
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

function BrowseCodePanel({ collectionName, sort }: {
  collectionName: string;
  sort: { col: string; dir: 1 | -1 } | null;
}) {
  const [lang, setLang] = useState<BrowseCodeLang>("ts");
  const code = getBrowseCode(lang, collectionName, sort);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--border-subtle)" }}
    >
      {/* Language selector bar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-subtle)" }}
      >
        <div className="flex gap-0.5">
          {(Object.keys(BROWSE_LANG_LABELS) as BrowseCodeLang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
              style={{
                backgroundColor: lang === l ? "var(--interactive-light)" : "transparent",
                color: lang === l ? "var(--interactive)" : "var(--text-muted)",
                border: lang === l ? "1px solid var(--interactive-border)" : "1px solid transparent",
              }}
            >
              {BROWSE_LANG_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}>
            {BROWSE_LANG_SDK[lang]}
          </span>
          <BrowseCopyButton text={code} />
        </div>
      </div>
      {/* Code block */}
      <div style={{ backgroundColor: "var(--bg-card)" }}>
        <pre
          className="text-[12px] px-4 py-3 overflow-x-auto leading-relaxed"
          style={{
            fontFamily: "IBM Plex Mono, monospace",
            color: "var(--text-secondary)",
            whiteSpace: "pre",
            margin: 0,
          }}
        >
          {renderBrowseCode(lang, code)}
        </pre>
      </div>
    </div>
  );
}

function renderBrowseCode(lang: BrowseCodeLang, code: string) {
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {lang === "ts" && line
        .replace(/^(await )/, "⟨await⟩")
        .split(/(⟨await⟩|"[^"]*"|\$[a-zA-Z]+|\.find\b|\b(?:db|collection)\b)/g)
        .map((part, j) => {
          if (part === "⟨await⟩") return <span key={j} style={{ color: "var(--interactive)" }}>await </span>;
          if (part.startsWith('"')) return <span key={j} style={{ color: "var(--step-respond)" }}>{part}</span>;
          if (part.startsWith("$")) return <span key={j} style={{ color: "var(--step-embed)" }}>{part}</span>;
          if (part === ".find") return <span key={j} style={{ color: "var(--interactive)" }}>{part}</span>;
          if (part === "db" || part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {lang === "python" && line
        .split(/(from\s+\w+|import\s+\w+|"[^"]*"|\bSortDocuments\b|\bcollection\b)/g)
        .map((part, j) => {
          if (part.startsWith("from ") || part.startsWith("import ")) return <span key={j} style={{ color: "var(--interactive)" }}>{part}</span>;
          if (part.startsWith('"')) return <span key={j} style={{ color: "var(--step-respond)" }}>{part}</span>;
          if (part === "SortDocuments") return <span key={j} style={{ color: "var(--step-embed)" }}>{part}</span>;
          if (part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {lang === "java" && line
        .split(/(new\s+\w+|Filter\.empty\(\)|Sorts\.\w+|"[^"]*"|\bcollection\b)/g)
        .map((part, j) => {
          if (part.startsWith("new ")) return <span key={j} style={{ color: "var(--interactive)" }}>{part}</span>;
          if (part === "Filter.empty()") return <span key={j} style={{ color: "var(--text-muted)" }}>{part}</span>;
          if (part.startsWith("Sorts.")) return <span key={j} style={{ color: "var(--step-embed)" }}>{part}</span>;
          if (part.startsWith('"')) return <span key={j} style={{ color: "var(--step-respond)" }}>{part}</span>;
          if (part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {lang === "curl" && line
        .split(/(curl|-[XHd]|"[^"]*"|\$[A-Z_]+)/g)
        .map((part, j) => {
          if (part === "curl") return <span key={j} style={{ color: "var(--interactive)" }}>{part}</span>;
          if (part === "-X" || part === "-H" || part === "-d") return <span key={j} style={{ color: "var(--text-muted)" }}>{part}</span>;
          if (part.startsWith('"')) return <span key={j} style={{ color: "var(--step-respond)" }}>{part}</span>;
          if (part.startsWith("$")) return <span key={j} style={{ color: "var(--step-embed)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {"\n"}
    </span>
  ));
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
            style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-subtle)" }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Full Document
            </p>
            <pre
              className="text-[12px] leading-relaxed overflow-x-auto"
              style={{ color: "var(--interactive)", fontFamily: "IBM Plex Mono, monospace" }}
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
  const [activeTab, setActiveTab] = useState<"output" | "code">("output");
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
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 border-b shrink-0 flex items-center justify-between"
        style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-panel)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(255,107,53,0.2), rgba(108,99,255,0.2))",
              border: "1px solid rgba(255, 107, 53, 0.3)",
            }}
          >
            <Table2 size={15} style={{ color: "var(--step-search)" }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)", fontFamily: "IBM Plex Mono, monospace" }}
              >
                {collection.name}
              </h2>
              {collection.vectorDim && (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "rgba(0, 194, 203, 0.1)",
                    border: "1px solid rgba(0, 194, 203, 0.2)",
                    color: "var(--step-embed)",
                  }}
                >
                  {collection.vectorDim}d
                </span>
              )}
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {inferredTotal !== null ? `${inferredTotal.toLocaleString()}${!isLastKnownPage && !knownTotal ? "+" : ""} documents` : "documents"}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <motion.button
            onClick={handleRefresh}
            className="p-2 rounded-lg"
            style={{ color: "var(--text-muted)", backgroundColor: "rgba(0,0,0,0)" }}
            whileHover={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" }}
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
            style={{ color: displayDocs.length > 0 ? "var(--text-muted)" : "var(--border-strong)", backgroundColor: "rgba(0,0,0,0)" }}
            whileHover={displayDocs.length > 0 ? { backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" } : {}}
            whileTap={displayDocs.length > 0 ? { scale: 0.9 } : {}}
            title="Export current page as CSV"
          >
            <Download size={14} />
          </motion.button>

          <motion.button
            onClick={onSwitchToChat}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: "var(--interactive-light)",
              border: "1px solid var(--interactive-border)",
              color: "var(--interactive)",
            }}
            whileHover={{
              backgroundColor: "var(--interactive-light)",
              borderColor: "var(--interactive)",
            }}
            whileTap={{ scale: 0.97 }}
          >
            <MessageSquare size={13} />
            <span>Ask about this data</span>
          </motion.button>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="px-6 py-2 border-b shrink-0 flex items-center gap-2"
        style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-panel)" }}
      >
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-lg"
          style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
        >
          <button
            onClick={() => setActiveTab("output")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              backgroundColor: activeTab === "output" ? "var(--bg-panel)" : "transparent",
              color: activeTab === "output" ? "var(--text-primary)" : "var(--text-muted)",
              boxShadow: activeTab === "output" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <Table2 size={11} />
            Output
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              backgroundColor: activeTab === "code" ? "var(--bg-panel)" : "transparent",
              color: activeTab === "code" ? "var(--interactive)" : "var(--text-muted)",
              boxShadow: activeTab === "code" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <Code2 size={11} />
            Code
          </button>
        </div>
      </div>

      {/* Code tab content */}
      {activeTab === "code" && (
        <div className="flex-1 overflow-auto px-6 py-4">
          <BrowseCodePanel collectionName={collection.name} sort={sort} />
        </div>
      )}

      {activeTab === "output" && <>
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
                  style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)", backgroundColor: "rgba(0,0,0,0)" }}
                  whileHover={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" }}
                  whileTap={{ scale: 0.97 }}
                >
                  Clear
                </motion.button>
                <motion.button
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold"
                  style={{
                    backgroundColor: deleting ? "var(--bg-card)" : "rgba(239,68,68,0.15)",
                    border: "1px solid rgba(239,68,68,0.4)",
                    color: deleting ? "var(--text-muted)" : "#f87171",
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
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ backgroundColor: "var(--bg-panel)", border: "1px solid var(--border-subtle)" }}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                <Loader2 size={14} style={{ color: "var(--step-embed)" }} />
              </motion.div>
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Loading…</span>
            </div>
          </div>
        )}
        {fetchError && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="text-center px-6">
              <p className="text-sm font-medium mb-1" style={{ color: "#fca5a5" }}>Failed to load documents</p>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{fetchError}</p>
            </div>
          </div>
        )}
        {!loading && !fetchError && displayDocs.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-5 text-center px-8 py-10 rounded-2xl max-w-sm"
              style={{ backgroundColor: "var(--bg-panel)", border: "1px solid var(--border-subtle)", boxShadow: "0 24px 64px rgba(0,0,0,0.15)" }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(0,194,203,0.12), rgba(108,99,255,0.12))", border: "1px solid rgba(0,194,203,0.2)" }}
              >
                <Table2 size={22} style={{ color: "var(--step-embed)" }} />
              </div>
              <div>
                <h3 className="text-base font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
                  No documents yet
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  This collection is empty. Ingest a CSV file to add documents.
                </p>
              </div>
              {onOpenIngest && (
                <motion.button
                  onClick={onOpenIngest}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                  style={{
                    backgroundColor: "var(--interactive)",
                    color: "#fff",
                    boxShadow: "0 2px 16px var(--interactive-border)",
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
            <tr style={{ backgroundColor: "var(--bg-panel)", borderBottom: "1px solid var(--border-subtle)" }}>
              {/* Checkbox select-all */}
              <th className="w-10 px-3 py-3" onClick={handleSelectAll} style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  readOnly
                  checked={displayDocs.length > 0 && selectedIds.size === displayDocs.length}
                  ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < displayDocs.length; }}
                  className="cursor-pointer"
                  style={{ accentColor: "var(--interactive)" }}
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
                      color: isSorted ? "var(--text-primary)" : col === "_id" ? "var(--step-search)" : col === "$vector" ? "var(--step-embed)" : "var(--text-muted)",
                      borderBottom: `1px solid ${isSorted ? "rgba(255,107,53,0.4)" : "var(--border-subtle)"}`,
                      fontFamily: col === "_id" || col === "$vector" ? "IBM Plex Mono, monospace" : undefined,
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
                            ? <ArrowUp size={11} style={{ color: "var(--step-search)" }} />
                            : <ArrowDown size={11} style={{ color: "var(--step-search)" }} />
                        ) : (
                          <ChevronsUpDown size={10} style={{ color: "var(--border-strong)", opacity: 0 }} className="group-hover:opacity-100" />
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
                      borderBottom: isExpanded ? "none" : "1px solid var(--border-subtle)",
                      backgroundColor: selectedIds.has(doc._id)
                        ? "rgba(239,68,68,0.05)"
                        : isExpanded
                        ? "var(--interactive-light)"
                        : i % 2 === 0
                        ? "rgba(0,0,0,0)"
                        : "var(--bg-card)",
                    }}
                    whileHover={{ backgroundColor: selectedIds.has(doc._id) ? "rgba(239,68,68,0.08)" : "var(--bg-hover)" }}
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
                        <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
                      </motion.div>
                    </td>
                    {columns.map((col) => (
                      <td
                        key={col}
                        className="px-4 py-3 text-sm max-w-[220px]"
                        style={{
                          fontFamily: col === "_id" ? "IBM Plex Mono, monospace" : undefined,
                          fontSize: col === "_id" ? "11px" : undefined,
                          color: col === "_id" ? "var(--text-secondary)" : undefined,
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
        style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-panel)" }}
      >
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Showing{" "}
          <span style={{ color: "var(--text-primary)" }}>{startRow.toLocaleString()}–{endRow.toLocaleString()}</span>
          {inferredTotal !== null ? (
            <>{" "}of{" "}<span style={{ color: "var(--text-primary)" }}>{inferredTotal.toLocaleString()}{!isLastKnownPage && !knownTotal ? "+" : ""}</span></>
          ) : null}
          {" "}documents
        </p>

        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Page {page + 1}{totalPages > 1 ? ` of ${totalPages.toLocaleString()}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <motion.button
              onClick={() => handlePageChange(Math.max(0, page - 1))}
              disabled={page === 0 || loading}
              className="p-1.5 rounded-lg"
              style={{ color: page === 0 || loading ? "var(--border-strong)" : "var(--text-muted)", cursor: page === 0 || loading ? "not-allowed" : "pointer", backgroundColor: "rgba(0,0,0,0)" }}
              whileHover={page > 0 && !loading ? { backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" } : {}}
              whileTap={page > 0 && !loading ? { scale: 0.9 } : {}}
            >
              <ChevronLeft size={15} />
            </motion.button>
            <motion.button
              onClick={() => handlePageChange(Math.min(availablePages - 1, page + 1))}
              disabled={page >= availablePages - 1 || loading}
              className="p-1.5 rounded-lg"
              style={{ color: page >= availablePages - 1 || loading ? "var(--border-strong)" : "var(--text-muted)", cursor: page >= availablePages - 1 || loading ? "not-allowed" : "pointer", backgroundColor: "rgba(0,0,0,0)" }}
              whileHover={page < availablePages - 1 && !loading ? { backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" } : {}}
              whileTap={page < availablePages - 1 && !loading ? { scale: 0.9 } : {}}
            >
              <ChevronRight size={15} />
            </motion.button>
          </div>
        </div>
      </div>
      </>}
    </motion.div>
  );
}
