"use client";

import { useCallback, useEffect, useState } from "react";
import type { IngestedDocumentSummary } from "@/lib/types";
import {
  fileKey,
  getFileType,
  type FileStatus,
} from "@/components/ingest/ingestShared";
import {
  MAX_DOCUMENT_UPLOAD_BYTES,
  MAX_DOCUMENT_UPLOAD_MB,
} from "@/lib/ingest/constants";
import { readNdjsonStream } from "@/lib/ndjson";

interface UseIngestUploadArgs {
  astraToken: string;
  astraEndpoint: string;
  keyspace: string;
  selectedCollection: string;
  huggingfaceApiKey?: string;
  prependDocument: (doc: IngestedDocumentSummary) => void;
  replaceDocumentsByIds: (
    doc: IngestedDocumentSummary,
    replacedSourceDocIds: string[]
  ) => void;
}

type NameConflictAction = "overwrite" | "skip";

type IngestOutcome = "done" | "skipped" | "conflict" | "error";

export function useIngestUpload({
  astraToken,
  astraEndpoint,
  keyspace,
  selectedCollection,
  huggingfaceApiKey,
  prependDocument,
  replaceDocumentsByIds,
}: UseIngestUploadArgs) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [fileStatuses, setFileStatuses] = useState<Map<string, FileStatus>>(
    new Map()
  );
  const [uploading, setUploading] = useState(false);
  const [defaultNameConflictAction, setDefaultNameConflictAction] =
    useState<NameConflictAction | null>(null);
  const [fileNameConflictActions, setFileNameConflictActions] = useState<
    Map<string, NameConflictAction>
  >(new Map());
  const [resumeTick, setResumeTick] = useState(0);

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
    setFileNameConflictActions((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const ingestOne = useCallback(
    async (file: File): Promise<IngestOutcome> => {
      const key = fileKey(file);
      const setStatus = (status: FileStatus) =>
        setFileStatuses((prev) => new Map(prev).set(key, status));

      if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
        setStatus({
          stage: "error",
          message: `File exceeds ${MAX_DOCUMENT_UPLOAD_MB} MB upload limit`,
        });
        return "error";
      }

      setStatus({ stage: "extracting" });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("collection", selectedCollection);
      formData.append("keyspace", keyspace);
      formData.append("token", astraToken);
      formData.append("endpoint", astraEndpoint);
      if (huggingfaceApiKey?.trim()) {
        formData.append("huggingfaceApiKey", huggingfaceApiKey.trim());
      }
      const nameConflictAction =
        fileNameConflictActions.get(key) ?? defaultNameConflictAction;
      if (nameConflictAction) {
        formData.append("nameConflictAction", nameConflictAction);
      }

      try {
        const res = await fetch("/api/ingest-document", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Ingestion failed");
        }
        if (!res.body) throw new Error("No response stream");

        let outcome: IngestOutcome = "done";

        await readNdjsonStream(res.body, (event: Record<string, unknown>) => {
          if (event.type === "prepare" && event.status === "running") {
            setStatus({
              stage: "preparing",
              message: String(event.message ?? "Preparing local model"),
              model:
                typeof event.model === "string" ? event.model : undefined,
              completed:
                typeof event.completed === "number"
                  ? event.completed
                  : undefined,
              total:
                typeof event.total === "number" ? event.total : undefined,
              determinate: event.determinate === true,
            });
          }
          if (event.type === "conflict") {
            setStatus({
              stage: "conflict",
              message:
                typeof event.message === "string"
                  ? event.message
                  : `A different "${file.name}" is already in this collection.`,
            });
            outcome = "conflict";
          }
          if (event.type === "skipped") {
            setStatus({
              stage: "skipped",
              message:
                typeof event.message === "string"
                  ? event.message
                  : `Skipped "${file.name}".`,
            });
            outcome = "skipped";
          }
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
            const replacedSourceDocIds = Array.isArray(
              event.replaced_source_doc_ids
            )
              ? (event.replaced_source_doc_ids as string[])
              : [];
            setStatus({ stage: "done", chunks });
            const documentSummary = {
              source_doc_id: docId,
              source_filename: file.name,
              file_type: getFileType(file.name),
              file_size: file.size,
              md5_hash:
                typeof event.md5_hash === "string" ? event.md5_hash : "",
              chunk_total: chunks,
              ingested_at: new Date().toISOString(),
              collection: selectedCollection,
            };

            if (replacedSourceDocIds.length > 0) {
              replaceDocumentsByIds(documentSummary, replacedSourceDocIds);
            } else {
              prependDocument(documentSummary);
            }
            outcome = "done";
          }
          if (event.type === "error") {
            outcome = "error";
            setStatus({
              stage: "error",
              message: event.message as string,
            });
          }
        });

        return outcome;
      } catch (err) {
        setStatus({
          stage: "error",
          message: err instanceof Error ? err.message : "Ingestion failed",
        });
        return "error";
      }
    },
    [
      astraEndpoint,
      astraToken,
      defaultNameConflictAction,
      fileNameConflictActions,
      huggingfaceApiKey,
      keyspace,
      prependDocument,
      replaceDocumentsByIds,
      selectedCollection,
    ]
  );

  const handleIngest = useCallback(async () => {
    if (queuedFiles.length === 0 || uploading) return;
    setUploading(true);
    for (const file of queuedFiles) {
      const status = fileStatuses.get(fileKey(file));
      if (
        status?.stage === "done" ||
        status?.stage === "skipped"
      ) {
        continue;
      }
      const outcome = await ingestOne(file);
      if (outcome === "conflict") {
        break;
      }
    }
    setUploading(false);
  }, [fileStatuses, ingestOne, queuedFiles, uploading]);

  const resolveConflict = useCallback(
    (
      file: File,
      action: NameConflictAction,
      applyToAll = false
    ) => {
      const key = fileKey(file);

      if (applyToAll) {
        setDefaultNameConflictAction(action);
      }

      if (action === "overwrite") {
        setFileNameConflictActions((prev) => new Map(prev).set(key, action));
        setFileStatuses((prev) => new Map(prev).set(key, { stage: "queued" }));
      } else {
        setFileStatuses((prev) =>
          new Map(prev).set(key, {
            stage: "skipped",
            message: `Skipped "${file.name}" because a different file with that name is already in this collection.`,
          })
        );
      }

      setResumeTick((prev) => prev + 1);
    },
    []
  );

  useEffect(() => {
    if (resumeTick === 0 || uploading) return;
    void handleIngest();
  }, [handleIngest, resumeTick, uploading]);

  return {
    isDragOver,
    setIsDragOver,
    queuedFiles,
    fileStatuses,
    uploading,
    addFiles,
    removeFile,
    handleIngest,
    resolveConflict,
  };
}
