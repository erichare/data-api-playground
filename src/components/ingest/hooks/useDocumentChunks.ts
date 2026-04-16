"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { IngestedDocumentSummary } from "@/lib/types";

interface UseDocumentChunksArgs {
  doc: IngestedDocumentSummary;
  connection?: BackendConnectionState | null;
  astraToken?: string;
  astraEndpoint?: string;
  selectedBackend?: DataApiBackendKind;
  knowledgeBackendMode?: KnowledgeBackendMode;
  openragConnection?: OpenragKnowledgeState | null;
  keyspace: string;
  isConnected: boolean;
}

export function useDocumentChunks({
  doc,
  connection,
  astraToken,
  astraEndpoint,
  selectedBackend = "astra",
  knowledgeBackendMode = "connected",
  openragConnection = null,
  keyspace,
  isConnected,
}: UseDocumentChunksArgs) {
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
  const [chunks, setChunks] = useState<Array<{ chunk_index: number; content: string }>>([]);
  const [loading, setLoading] = useState(isConnected);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isConnected) return;

    fetch("/api/documents/chunks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_doc_id: doc.source_doc_id,
        collection: doc.collection,
        ...buildConnectionRequestBody(resolvedConnection, { keyspace }),
        ...buildKnowledgeRequestBody({
          selectedBackend,
          knowledgeBackendMode,
          openragConnection,
        }),
      }),
    })
      .then((r) => r.json() as Promise<{ chunks?: typeof chunks; error?: string }>)
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setChunks(data.chunks ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [
    doc,
    isConnected,
    keyspace,
    knowledgeBackendMode,
    openragConnection,
    resolvedConnection,
    selectedBackend,
  ]);

  const fullText = useMemo(() => chunks.map((c) => c.content).join("\n\n"), [chunks]);

  const copyAll = () => {
    void navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return {
    chunks,
    loading,
    error,
    copied,
    copyAll,
  };
}
