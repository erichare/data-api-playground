"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  ACCEPTED,
  ACCEPTED_LABEL,
  FileIcon,
  fileKey,
  formatBytes,
  getFileType,
  type FileStatus,
} from "@/components/ingest/ingestShared";
import { MAX_DOCUMENT_UPLOAD_MB } from "@/lib/ingest/constants";

interface IngestUploadPanelProps {
  isDragOver: boolean;
  setIsDragOver: (value: boolean) => void;
  queuedFiles: File[];
  fileStatuses: Map<string, FileStatus>;
  selectedCollection: string;
  uploading: boolean;
  onFilesAdded: (files: File[]) => void;
  onRemoveFile: (file: File) => void;
  onIngest: () => void;
  onResolveConflict: (
    file: File,
    action: "overwrite" | "skip",
    applyToAll: boolean
  ) => void;
}

export function IngestUploadPanel({
  isDragOver,
  setIsDragOver,
  queuedFiles,
  fileStatuses,
  selectedCollection,
  uploading,
  onFilesAdded,
  onRemoveFile,
  onIngest,
  onResolveConflict,
}: IngestUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onFilesAdded(Array.from(e.dataTransfer.files));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFilesAdded(Array.from(e.target.files));
    e.target.value = "";
  };

  return (
    <div
      className="w-64 shrink-0 flex flex-col border-r"
      style={{
        backgroundColor: "var(--bg-panel)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          Upload Document
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {ACCEPTED_LABEL} · Up to {MAX_DOCUMENT_UPLOAD_MB} MB
        </p>
      </div>

      <div className="p-4">
        <div
          className="relative rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
          style={{
            minHeight: "130px",
            borderColor: isDragOver ? "var(--interactive)" : "var(--border-subtle)",
            backgroundColor: isDragOver ? "var(--interactive-light)" : "var(--bg-card)",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            className="hidden"
            onChange={handleInputChange}
          />
          <Upload
            size={20}
            style={{
              color: isDragOver ? "var(--interactive)" : "var(--text-muted)",
            }}
          />
          <p
            className="text-xs text-center"
            style={{
              color: isDragOver ? "var(--interactive)" : "var(--text-muted)",
            }}
          >
            {isDragOver ? "Drop to upload" : "Drop file or click"}
          </p>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {queuedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mb-3 rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--border-subtle)" }}
          >
            {queuedFiles.map((file) => (
              <QueuedFileRow
                key={fileKey(file)}
                file={file}
                status={fileStatuses.get(fileKey(file)) ?? { stage: "queued" }}
                uploading={uploading}
                onRemove={onRemoveFile}
                onResolveConflict={onResolveConflict}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 mb-3">
        <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
          Collection
        </label>
        <div
          className="rounded-lg px-3 py-2 text-xs truncate font-mono"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        >
          {selectedCollection || "—"}
        </div>
      </div>

      <div className="flex-1" />

      <div className="p-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <motion.button
          onClick={onIngest}
          disabled={queuedFiles.length === 0 || uploading}
          className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium"
          style={{
            backgroundColor:
              queuedFiles.length > 0 && !uploading
                ? "var(--interactive)"
                : "var(--bg-card)",
            color:
              queuedFiles.length > 0 && !uploading ? "#fff" : "var(--text-muted)",
            cursor:
              queuedFiles.length > 0 && !uploading ? "pointer" : "not-allowed",
          }}
          whileTap={queuedFiles.length > 0 && !uploading ? { scale: 0.97 } : {}}
        >
          {uploading ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Processing…
            </>
          ) : (
            <>
              <Upload size={12} />
              {queuedFiles.length > 1
                ? `Ingest ${queuedFiles.length} Files`
                : "Ingest Document"}
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}

function QueuedFileRow({
  file,
  status,
  uploading,
  onRemove,
  onResolveConflict,
}: {
  file: File;
  status: FileStatus;
  uploading: boolean;
  onRemove: (file: File) => void;
  onResolveConflict: (
    file: File,
    action: "overwrite" | "skip",
    applyToAll: boolean
  ) => void;
}) {
  const [applyToAll, setApplyToAll] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.15 }}
      className="px-3 py-2 border-b last:border-b-0"
      style={{
        borderColor: "var(--border-subtle)",
        backgroundColor: "var(--bg-card)",
      }}
    >
      <div className="flex items-center gap-2">
        <FileIcon type={getFileType(file.name)} size={13} />
        <span
          className="flex-1 text-xs truncate font-mono"
          style={{ color: "var(--text-primary)" }}
        >
          {file.name}
        </span>
        {status.stage === "queued" && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            queued
          </span>
        )}
        {status.stage === "extracting" && (
          <Loader2
            size={11}
            className="animate-spin shrink-0"
            style={{ color: "var(--interactive)" }}
          />
        )}
        {status.stage === "preparing" && (
          <Loader2
            size={11}
            className="animate-spin shrink-0"
            style={{ color: "#f59e0b" }}
          />
        )}
        {status.stage === "done" && (
          <CheckCircle2
            size={12}
            className="shrink-0"
            style={{ color: "#16a34a" }}
          />
        )}
        {status.stage === "error" && (
          <span title={status.message}>
            <AlertCircle
              size={12}
              className="shrink-0"
              style={{ color: "#ef4444" }}
            />
          </span>
        )}
        {status.stage === "skipped" && (
          <span title={status.message}>
            <CheckCircle2
              size={12}
              className="shrink-0"
              style={{ color: "#f59e0b" }}
            />
          </span>
        )}
        {status.stage === "conflict" && (
          <AlertTriangle
            size={12}
            className="shrink-0"
            style={{ color: "#f59e0b" }}
          />
        )}
        {(status.stage === "queued" ||
          status.stage === "done" ||
          status.stage === "error" ||
          status.stage === "skipped") &&
          !uploading && (
            <button
              onClick={() => onRemove(file)}
              className="shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={11} />
            </button>
          )}
      </div>
      {status.stage === "storing" && (
        <div className="mt-1.5">
          <div className="flex justify-between mb-0.5">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Storing…
            </span>
            <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
              {status.processed}/{status.total}
            </span>
          </div>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: "var(--interactive)" }}
              animate={{
                width:
                  status.total > 0
                    ? `${Math.round((status.processed / status.total) * 100)}%`
                    : "0%",
              }}
              transition={{ ease: "easeOut", duration: 0.3 }}
            />
          </div>
        </div>
      )}
      {status.stage === "preparing" && (
        <div className="mt-1.5">
          <div className="flex justify-between gap-2 mb-0.5">
            <span className="text-xs" style={{ color: "#f59e0b" }}>
              {status.model
                ? `Downloading ${status.model}`
                : "Preparing local model"}
            </span>
            {status.determinate &&
              typeof status.completed === "number" &&
              typeof status.total === "number" && (
                <span
                  className="text-xs font-mono"
                  style={{ color: "var(--text-primary)" }}
                >
                  {formatBytes(status.completed)}/{formatBytes(status.total)}
                </span>
              )}
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {status.message}. First run can take several GB and a few minutes.
          </p>
          <div
            className="h-1 rounded-full overflow-hidden mt-1.5"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: "#f59e0b" }}
              animate={{
                width:
                  status.determinate &&
                  typeof status.completed === "number" &&
                  typeof status.total === "number" &&
                  status.total > 0
                    ? `${Math.round((status.completed / status.total) * 100)}%`
                    : "35%",
                opacity: status.determinate ? 1 : [0.4, 1, 0.4],
              }}
              transition={
                status.determinate
                  ? { ease: "easeOut", duration: 0.3 }
                  : { duration: 1.2, repeat: Infinity }
              }
            />
          </div>
        </div>
      )}
      {status.stage === "conflict" && !uploading && (
        <div className="mt-2 rounded-md px-2.5 py-2" style={{ backgroundColor: "rgba(245,158,11,0.08)" }}>
          <p className="text-[11px]" style={{ color: "#fcd34d" }}>
            {status.message}
          </p>
          <label
            className="mt-2 flex items-center gap-1.5 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(event) => setApplyToAll(event.target.checked)}
            />
            Apply to later filename conflicts in this queue
          </label>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => onResolveConflict(file, "overwrite", applyToAll)}
              className="rounded-md px-2 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: "var(--interactive)",
                color: "#fff",
              }}
            >
              Overwrite
            </button>
            <button
              onClick={() => onResolveConflict(file, "skip", applyToAll)}
              className="rounded-md px-2 py-1 text-[11px] font-medium"
              style={{
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}
      {status.stage === "skipped" && (
        <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {status.message}
        </p>
      )}
      {status.stage === "error" && (
        <p className="mt-1.5 text-[11px]" style={{ color: "#fca5a5" }}>
          {status.message}
        </p>
      )}
    </motion.div>
  );
}
