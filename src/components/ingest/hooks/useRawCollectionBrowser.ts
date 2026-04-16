"use client";
/* eslint-disable security/detect-object-injection -- Browser state merges typed sort/page payloads using constrained collection keys. */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BackendConnectionState } from "@/lib/backends/types";
import { buildConnectionRequestBody } from "@/lib/backends/types";

interface UseRawCollectionBrowserArgs {
  isConnected: boolean;
  selectedCollection: string;
  connection?: BackendConnectionState | null;
  astraToken?: string;
  astraEndpoint?: string;
  keyspace: string;
}

export function useRawCollectionBrowser({
  isConnected,
  selectedCollection,
  connection,
  astraToken,
  astraEndpoint,
  keyspace,
}: UseRawCollectionBrowserArgs) {
  const resolvedConnection = useMemo(
    () =>
      connection ??
      (astraToken || astraEndpoint
        ? {
            backend: "astra" as const,
            token: astraToken ?? "",
            endpoint: astraEndpoint ?? "",
          }
        : null),
    [astraEndpoint, astraToken, connection]
  );
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
          ...buildConnectionRequestBody(resolvedConnection, { keyspace }),
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
  }, [isConnected, keyspace, resolvedConnection, selectedCollection]);

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
