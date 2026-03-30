"use client";

import { useCallback, useEffect, useState } from "react";

interface UseRawCollectionBrowserArgs {
  isConnected: boolean;
  selectedCollection: string;
  astraToken: string;
  astraEndpoint: string;
  keyspace: string;
}

export function useRawCollectionBrowser({
  isConnected,
  selectedCollection,
  astraToken,
  astraEndpoint,
  keyspace,
}: UseRawCollectionBrowserArgs) {
  const [rawOpen, setRawOpen] = useState(false);
  const [rawDocs, setRawDocs] = useState<Record<string, unknown>[]>([]);
  const [loadingRaw, setLoadingRaw] = useState(false);
  const [rawError, setRawError] = useState("");
  const [rawPageState, setRawPageState] = useState<string | null>(null);
  const [rawPageHistory, setRawPageHistory] = useState<(string | null)[]>([null]);
  const [rawPageIndex, setRawPageIndex] = useState(0);

  const loadRawDocs = useCallback(async (pageState: string | null) => {
    if (!isConnected) return;
    setLoadingRaw(true);
    setRawError("");
    try {
      const res = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: astraToken,
          endpoint: astraEndpoint,
          keyspace,
          collection: selectedCollection,
          pageState,
        }),
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
  }, [isConnected, selectedCollection, astraToken, astraEndpoint, keyspace]);

  const resetAndLoadFirstPage = useCallback(() => {
    setRawPageHistory([null]);
    setRawPageIndex(0);
    void loadRawDocs(null);
  }, [loadRawDocs]);

  useEffect(() => {
    if (rawOpen && isConnected) resetAndLoadFirstPage();
  }, [rawOpen, selectedCollection, isConnected, resetAndLoadFirstPage]);

  const goToPreviousPage = useCallback(() => {
    const prevIdx = rawPageIndex - 1;
    const prevPage = rawPageHistory[prevIdx] ?? null;
    setRawPageIndex(prevIdx);
    void loadRawDocs(prevPage);
  }, [rawPageHistory, rawPageIndex, loadRawDocs]);

  const goToNextPage = useCallback(() => {
    const nextIdx = rawPageIndex + 1;
    const newHistory = [...rawPageHistory];
    if (!newHistory[nextIdx]) newHistory[nextIdx] = rawPageState;
    setRawPageHistory(newHistory);
    setRawPageIndex(nextIdx);
    void loadRawDocs(rawPageState);
  }, [rawPageHistory, rawPageIndex, rawPageState, loadRawDocs]);

  return {
    rawOpen,
    setRawOpen,
    rawDocs,
    loadingRaw,
    rawError,
    rawPageState,
    rawPageIndex,
    loadRawDocs,
    resetAndLoadFirstPage,
    goToPreviousPage,
    goToNextPage,
  };
}
