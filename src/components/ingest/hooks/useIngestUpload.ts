"use client";

import { useCallback, useState } from "react";
import type { IngestedDocumentSummary } from "@/lib/types";
import {
  fileKey,
  getFileType,
  type FileStatus,
} from "@/components/ingest/ingestShared";

interface UseIngestUploadArgs {
  astraToken: string;
  astraEndpoint: string;
  keyspace: string;
  selectedCollection: string;
  prependDocument: (doc: IngestedDocumentSummary) => void;
}

export function useIngestUpload({
  astraToken,
  astraEndpoint,
  keyspace,
  selectedCollection,
  prependDocument,
}: UseIngestUploadArgs) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [fileStatuses, setFileStatuses] = useState<Map<string, FileStatus>>(
    new Map()
  );
  const [uploading, setUploading] = useState(false);

  const addFiles = useCallback((files: File[]) => {
    setQueuedFiles((prev) => {
      const existingKeys = new Set(prev.map(fileKey));
      const fresh = files.filter((file) => !existingKeys.has(fileKey(file)));
      return [...prev, ...fresh];
    });
    setFileStatuses((prev) => {
      const next = new Map(prev);
      for (const file of files) {
        if (!next.has(fileKey(file))) {
          next.set(fileKey(file), { stage: "queued" });
        }
      }
      return next;
    });
  }, []);

  const removeFile = useCallback((file: File) => {
    const key = fileKey(file);
    setQueuedFiles((prev) => prev.filter((candidate) => fileKey(candidate) !== key));
    setFileStatuses((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const ingestOne = useCallback(
    async (file: File) => {
      const key = fileKey(file);
      const setStatus = (status: FileStatus) =>
        setFileStatuses((prev) => new Map(prev).set(key, status));

      setStatus({ stage: "extracting" });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("collection", selectedCollection);
      formData.append("keyspace", keyspace);
      formData.append("token", astraToken);
      formData.append("endpoint", astraEndpoint);

      try {
        const res = await fetch("/api/ingest-document", {
          method: "POST",
          body: formData,
        });
        if (!res.body) throw new Error("No response stream");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as Record<string, unknown>;

            if (event.type === "chunked") {
              setStatus({
                stage: "storing",
                processed: 0,
                total: event.chunks as number,
              });
            }
            if (event.type === "chunk_progress") {
              setStatus({
                stage: "storing",
                processed: event.processed as number,
                total: event.total as number,
              });
            }
            if (event.type === "complete") {
              const chunks = event.chunks as number;
              const docId = event.source_doc_id as string;
              setStatus({ stage: "done", chunks });
              prependDocument({
                source_doc_id: docId,
                source_filename: file.name,
                file_type: getFileType(file.name),
                file_size: file.size,
                md5_hash: "",
                chunk_total: chunks,
                ingested_at: new Date().toISOString(),
                collection: selectedCollection,
              });
            }
            if (event.type === "error") {
              throw new Error(event.message as string);
            }
          }
        }
      } catch (err) {
        setStatus({
          stage: "error",
          message: err instanceof Error ? err.message : "Ingestion failed",
        });
      }
    },
    [astraEndpoint, astraToken, keyspace, prependDocument, selectedCollection]
  );

  const handleIngest = useCallback(async () => {
    if (queuedFiles.length === 0 || uploading) return;
    setUploading(true);
    for (const file of queuedFiles) {
      const status = fileStatuses.get(fileKey(file));
      if (status?.stage === "done") continue;
      await ingestOne(file);
    }
    setUploading(false);
  }, [fileStatuses, ingestOne, queuedFiles, uploading]);

  return {
    isDragOver,
    setIsDragOver,
    queuedFiles,
    fileStatuses,
    uploading,
    addFiles,
    removeFile,
    handleIngest,
  };
}
