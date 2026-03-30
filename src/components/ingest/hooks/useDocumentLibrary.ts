"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { IngestFileType, IngestedDocumentSummary } from "@/lib/types";
import { getMockDocuments } from "@/components/ingest/ingestShared";

interface UseDocumentLibraryArgs {
  isConnected: boolean;
  selectedCollection: string;
  astraToken: string;
  astraEndpoint: string;
  keyspace: string;
}

export function useDocumentLibrary({
  isConnected,
  selectedCollection,
  astraToken,
  astraEndpoint,
  keyspace,
}: UseDocumentLibraryArgs) {
  const [documents, setDocuments] = useState<IngestedDocumentSummary[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<IngestFileType | "all">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<IngestedDocumentSummary | null>(null);
  const [loadError, setLoadError] = useState("");

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    setLoadError("");
    if (!isConnected) {
      setDocuments(getMockDocuments(selectedCollection));
      setLoadingDocs(false);
      return;
    }
    try {
      const params = new URLSearchParams({ collection: selectedCollection });
      const res = await fetch(`/api/documents?${params}`);
      const data = await res.json() as {
        documents?: IngestedDocumentSummary[];
        error?: string;
        requestId?: string;
      };
      if (!res.ok || data.error) {
        const message = data.error ?? "Failed to load documents";
        throw new Error(
          data.requestId ? `${message} (request ${data.requestId})` : message
        );
      }
      setDocuments(data.documents ?? []);
    } catch (err) {
      setDocuments([]);
      setLoadError(
        err instanceof Error ? err.message : "Failed to load documents"
      );
    } finally {
      setLoadingDocs(false);
    }
  }, [isConnected, selectedCollection]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const handleDelete = useCallback(async (doc: IngestedDocumentSummary) => {
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
  }, [isConnected, astraToken, astraEndpoint, keyspace]);

  const prependDocument = useCallback((doc: IngestedDocumentSummary) => {
    setDocuments((prev) => [doc, ...prev]);
  }, []);

  const filteredDocs = useMemo(() => (
    documents.filter((d) => {
      const matchesSearch = !search || d.source_filename.toLowerCase().includes(search.toLowerCase());
      const matchesType = filterType === "all" || d.file_type === filterType;
      return matchesSearch && matchesType;
    })
  ), [documents, search, filterType]);

  return {
    documents,
    loadingDocs,
    search,
    setSearch,
    filterType,
    setFilterType,
    deletingId,
    viewingDoc,
    setViewingDoc,
    loadError,
    filteredDocs,
    loadDocuments,
    handleDelete,
    prependDocument,
  };
}
