"use client";

import React, { useState } from "react";
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
} from "lucide-react";
import type { Collection, CollectionDocument } from "@/lib/types";
import { BrowseCodePanel } from "@/components/collection/BrowseCodePanel";
import { useCollectionBrowse } from "@/components/collection/hooks/useCollectionBrowse";

interface CollectionViewerProps {
  collection: Collection;
  onSwitchToChat: () => void;
  astraToken?: string;
  astraEndpoint?: string;
  keyspace?: string;
  onCountChange?: (name: string, exactCount: number) => void;
  onOpenIngest?: () => void;
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

export function CollectionViewer({ collection, onSwitchToChat, astraToken, astraEndpoint, keyspace, onCountChange, onOpenIngest }: CollectionViewerProps) {
  const [activeTab, setActiveTab] = useState<"output" | "code">("output");
  const {
    displayDocs,
    expandedId,
    setExpandedId,
    isRefreshing,
    sort,
    selectedIds,
    deleting,
    deleteError,
    loading,
    fetchError,
    columns,
    availablePages,
    inferredTotal,
    isLastKnownPage,
    knownTotal,
    startRow,
    endRow,
    handleSortColumn,
    handleRefresh,
    handlePageChange,
    handleToggleSelect,
    handleSelectAll,
    handleClearSelection,
    handleDelete,
    page,
  } = useCollectionBrowse({
    collection,
    astraToken,
    astraEndpoint,
    keyspace,
    onCountChange,
  });

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
                  onClick={handleClearSelection}
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
