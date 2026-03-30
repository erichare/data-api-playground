"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PAGE_SIZE } from "@/lib/mock/data";
import type { Collection, CollectionDocument } from "@/lib/types";
import { getColumns } from "@/components/collection/collectionBrowseShared";

interface UseCollectionBrowseArgs {
  collection: Collection;
  astraToken?: string;
  astraEndpoint?: string;
  keyspace?: string;
  isConnected?: boolean;
  onCountChange?: (name: string, exactCount: number) => void;
}

export function useCollectionBrowse({
  collection,
  astraToken,
  astraEndpoint,
  keyspace,
  isConnected = false,
  onCountChange,
}: UseCollectionBrowseArgs) {
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [realDocs, setRealDocs] = useState<CollectionDocument[]>([]);
  const [pageStates, setPageStates] = useState<(string | null)[]>([null]);
  const [nextPageState, setNextPageState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const fetchCount = useCallback(() => {
    if (!isConnected) return;
    void fetch("/api/count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: astraToken, endpoint: astraEndpoint, keyspace, collection: collection.name }),
    })
      .then((r) => r.json() as Promise<{ count?: number; error?: string }>)
      .then((data) => { if (data.count !== undefined) onCountChange?.(collection.name, data.count); })
      .catch(() => { /* best effort */ });
  }, [astraToken, astraEndpoint, collection.name, isConnected, keyspace, onCountChange]);

  const fetchPage = useCallback(async (pageIndex: number, pageStateForIndex: string | null, currentSort: typeof sort) => {
    if (!isConnected) return;
    setLoading(true);
    setFetchError("");
    try {
      const res = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: astraToken,
          endpoint: astraEndpoint,
          keyspace,
          collection: collection.name,
          pageState: pageStateForIndex ?? undefined,
          sort: currentSort ?? undefined,
        }),
      });
      const data = await res.json() as { documents?: CollectionDocument[]; nextPageState?: string | null; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to fetch");
      const docs = (data.documents ?? []).map((d) => {
        if (typeof d.$vector === "string" && (d.$vector as string).startsWith("__vector_")) {
          const dims = parseInt((d.$vector as string).replace("__vector_", "").replace("__", ""), 10);
          return { ...d, $vector: new Array(dims).fill(0) };
        }
        return d;
      });
      setRealDocs(docs);
      setNextPageState(data.nextPageState ?? null);
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
  }, [astraEndpoint, astraToken, collection.name, isConnected, keyspace]);

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
  }, [collection.name, isConnected, fetchPage, fetchCount, sort]);

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

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.size === realDocs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(realDocs.map((d) => d._id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
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
          keyspace,
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

  const columns = useMemo(() => getColumns(realDocs), [realDocs]);
  const availablePages = nextPageState ? page + 2 : page + 1;
  const startRow = page * PAGE_SIZE + 1;
  const endRow = page * PAGE_SIZE + realDocs.length;
  const isLastKnownPage = !nextPageState;
  const knownTotal = collection.count > 0 ? collection.count : null;
  const inferredTotal = isLastKnownPage ? endRow : knownTotal;

  return {
    isConnected,
    page,
    setPage,
    expandedId,
    setExpandedId,
    isRefreshing,
    sort,
    selectedIds,
    deleting,
    deleteError,
    setDeleteError,
    displayDocs: realDocs,
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
  };
}
