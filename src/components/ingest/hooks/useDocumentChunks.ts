"use client";

import { useEffect, useMemo, useState } from "react";
import type { IngestedDocumentSummary } from "@/lib/types";

interface UseDocumentChunksArgs {
  doc: IngestedDocumentSummary;
  astraToken: string;
  astraEndpoint: string;
  keyspace: string;
  isConnected: boolean;
}

export function useDocumentChunks({
  doc,
  astraToken,
  astraEndpoint,
  keyspace,
  isConnected,
}: UseDocumentChunksArgs) {
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
        token: astraToken,
        endpoint: astraEndpoint,
        keyspace,
      }),
    })
      .then((r) => r.json() as Promise<{ chunks?: typeof chunks; error?: string }>)
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setChunks(data.chunks ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [doc, astraToken, astraEndpoint, keyspace, isConnected]);

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
