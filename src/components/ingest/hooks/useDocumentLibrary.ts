"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BackendConnectionState,
  DataApiBackendKind,
} from "@/lib/backends/types";
import { buildConnectionRequestBody } from "@/lib/backends/types";
import { buildKnowledgeRequestBody } from "@/lib/knowledge/client";
import type {
  KnowledgeBackendMode,
  OpenragKnowledgeState,
} from "@/lib/knowledge/types";
import type { IngestFileType, IngestedDocumentSummary } from "@/lib/types";
import { getMockDocuments } from "@/components/ingest/ingestShared";
import { readApiErrorMessage } from "@/lib/playground/client";

interface UseDocumentLibraryArgs {
  isConnected: boolean;
  selectedCollection: string;
  connection?: BackendConnectionState | null;
  astraToken?: string;
  astraEndpoint?: string;
  selectedBackend?: DataApiBackendKind;
  knowledgeBackendMode?: KnowledgeBackendMode;
  openragConnection?: OpenragKnowledgeState | null;
  keyspace: string;
  onCollectionStatsDelta?: (
    name: string,
    delta: { documentDelta: number; chunkDelta: number }
  ) => void;
}

export function useDocumentLibrary({
  isConnected,
  selectedCollection,
  connection,
  astraToken,
  astraEndpoint,
  selectedBackend = "astra",
  knowledgeBackendMode = "connected",
  openragConnection = null,
  keyspace,
  onCollectionStatsDelta,
}: UseDocumentLibraryArgs) {
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
  const [documents, setDocuments] = useState<IngestedDocumentSummary[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<IngestFileType | "all">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<IngestedDocumentSummary | null>(null);
  const [loadError, setLoadError] = useState("");

  const buildDocumentQueryString = useCallback(() => {
    const params = new URLSearchParams({ collection: selectedCollection, keyspace });

    if (knowledgeBackendMode === "openrag") {
      params.set("knowledgeBackend", "openrag");
      if (openragConnection?.baseUrl && !openragConnection.fromEnv) {
        params.set("openragBaseUrl", openragConnection.baseUrl);
      }
      return params.toString();
    }

    params.set("backend", selectedBackend);
    if (resolvedConnection?.backend === "astra") {
      if (resolvedConnection.fromAstraCli) {
        params.set("fromAstraCli", "true");
        if (resolvedConnection.astraCliProfile) {
          params.set("astraCliProfile", resolvedConnection.astraCliProfile);
        }
        if (resolvedConnection.astraCliDatabase) {
          params.set("astraCliDatabase", resolvedConnection.astraCliDatabase);
        }
      } else if (resolvedConnection.endpoint) {
        params.set("endpoint", resolvedConnection.endpoint);
      }
    }

    if (resolvedConnection?.backend === "hcd" && resolvedConnection.endpoint) {
      params.set("endpoint", resolvedConnection.endpoint);
    }

    return params.toString();
  }, [
    keyspace,
    knowledgeBackendMode,
    openragConnection,
    resolvedConnection,
    selectedBackend,
    selectedCollection,
  ]);

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    setLoadError("");
    if (!isConnected) {
      setDocuments(getMockDocuments(selectedCollection));
      setLoadingDocs(false);
      return;
    }
    try {
      const res = await fetch(`/api/documents?${buildDocumentQueryString()}`);
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
  }, [buildDocumentQueryString, isConnected, selectedCollection]);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const handleDelete = useCallback(async (doc: IngestedDocumentSummary) => {
    setDeletingId(doc.source_doc_id);
    setLoadError("");
    try {
      if (isConnected) {
        const response = await fetch("/api/documents", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...buildConnectionRequestBody(resolvedConnection, { keyspace }),
            ...buildKnowledgeRequestBody({
              selectedBackend,
              knowledgeBackendMode,
              openragConnection,
            }),
            source_doc_id: doc.source_doc_id,
            collection: doc.collection,
          }),
        });

        if (!response.ok) {
          throw new Error(
            await readApiErrorMessage(response, "Failed to delete document")
          );
        }
      }
      setDocuments((prev) => prev.filter((d) => d.source_doc_id !== doc.source_doc_id));
      onCollectionStatsDelta?.(doc.collection, {
        documentDelta: -1,
        chunkDelta: -doc.chunk_total,
      });
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to delete document"
      );
    } finally {
      setDeletingId(null);
    }
  }, [
    isConnected,
    keyspace,
    knowledgeBackendMode,
    onCollectionStatsDelta,
    openragConnection,
    resolvedConnection,
    selectedBackend,
  ]);

  const prependDocument = useCallback((doc: IngestedDocumentSummary) => {
    setDocuments((prev) => [doc, ...prev]);
    onCollectionStatsDelta?.(doc.collection, {
      documentDelta: 1,
      chunkDelta: doc.chunk_total,
    });
  }, [onCollectionStatsDelta]);

  const replaceDocumentsByIds = useCallback(
    (doc: IngestedDocumentSummary, replacedSourceDocIds: string[]) => {
      const replacedIdSet = new Set(replacedSourceDocIds);
      const replacedChunkTotal = documents
        .filter((existingDoc) => replacedIdSet.has(existingDoc.source_doc_id))
        .reduce((total, existingDoc) => total + existingDoc.chunk_total, 0);
      setDocuments((prev) => [
        doc,
        ...prev.filter((existingDoc) => !replacedIdSet.has(existingDoc.source_doc_id)),
      ]);
      onCollectionStatsDelta?.(doc.collection, {
        documentDelta: 1 - replacedSourceDocIds.length,
        chunkDelta: doc.chunk_total - replacedChunkTotal,
      });
    },
    [documents, onCollectionStatsDelta]
  );

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
    replaceDocumentsByIds,
  };
}
