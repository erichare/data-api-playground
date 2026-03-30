"use client";

import { Braces, FileCode, FileText, Table } from "lucide-react";
import type { IngestFileType, IngestedDocumentSummary } from "@/lib/types";
import { mockIngestedDocuments } from "@/lib/mock/data";

export const ACCEPTED = ".pdf,.txt,.md,.csv,.json,.docx";
export const ACCEPTED_LABEL = "PDF · TXT · MD · DOCX · CSV · JSON";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function getFileType(filename: string): IngestFileType {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "txt";
  return (["pdf", "txt", "md", "csv", "json", "docx"].includes(ext) ? ext : "txt") as IngestFileType;
}

export function FileIcon({ type, size = 14 }: { type: IngestFileType; size?: number }) {
  const props = { size, strokeWidth: 1.75 };
  switch (type) {
    case "pdf": return <FileText {...props} style={{ color: "#ef4444" }} />;
    case "docx": return <FileText {...props} style={{ color: "#3b82f6" }} />;
    case "md": return <FileCode {...props} style={{ color: "#22c55e" }} />;
    case "csv": return <Table {...props} style={{ color: "#f97316" }} />;
    case "json": return <Braces {...props} style={{ color: "#a855f7" }} />;
    default: return <FileText {...props} style={{ color: "var(--text-muted)" }} />;
  }
}

export function TypeBadge({ type }: { type: IngestFileType }) {
  const colors: Record<IngestFileType, string> = {
    pdf: "#ef444420",
    docx: "#3b82f620",
    md: "#22c55e20",
    csv: "#f9731620",
    json: "#a855f720",
    txt: "var(--bg-card)",
  };
  const text: Record<IngestFileType, string> = {
    pdf: "#ef4444", docx: "#3b82f6", md: "#22c55e",
    csv: "#f97316", json: "#a855f7", txt: "var(--text-muted)",
  };
  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs font-mono font-medium uppercase"
      style={{ backgroundColor: colors[type], color: text[type] }}
    >
      {type}
    </span>
  );
}

export type FileStatus =
  | { stage: "queued" }
  | { stage: "extracting" }
  | { stage: "storing"; processed: number; total: number }
  | { stage: "done"; chunks: number }
  | { stage: "error"; message: string };

export function fileKey(f: File) {
  return `${f.name}__${f.size}`;
}

export function getMockDocuments(selectedCollection: string): IngestedDocumentSummary[] {
  return mockIngestedDocuments.filter((d) => d.collection === selectedCollection);
}
