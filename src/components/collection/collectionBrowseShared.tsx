"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { CollectionDocument } from "@/lib/types";

export type BrowseCodeLang = "ts" | "python" | "java" | "curl";

export const BROWSE_LANG_LABELS: Record<BrowseCodeLang, string> = {
  ts: "TypeScript",
  python: "Python",
  java: "Java",
  curl: "cURL",
};

export const BROWSE_LANG_SDK: Record<BrowseCodeLang, string> = {
  ts: "astra-db-ts",
  python: "astrapy",
  java: "astra-db-java",
  curl: "Data API",
};

export function getColumns(docs: CollectionDocument[]): string[] {
  const keys = new Set<string>();
  for (const doc of docs.slice(0, 5)) {
    for (const key of Object.keys(doc)) keys.add(key);
  }
  return Array.from(keys).sort((a, b) => {
    if (a === "_id") return -1;
    if (b === "_id") return 1;
    if (a === "$vector") return 1;
    if (b === "$vector") return -1;
    return a.localeCompare(b);
  });
}

export function getBrowseCode(lang: BrowseCodeLang, collectionName: string, sort: { col: string; dir: 1 | -1 } | null): string {
  switch (lang) {
    case "ts":
      return sort
        ? `await db.collection("${collectionName}")\n  .find({}, { sort: { "${sort.col}": ${sort.dir} } })\n  .toArray()`
        : `await db.collection("${collectionName}")\n  .find({})\n  .toArray()`;
    case "python":
      return sort
        ? `from astrapy.constants import SortDocuments\ncollection.find(\n    {},\n    sort={"${sort.col}": SortDocuments.${sort.dir === 1 ? "ASCENDING" : "DESCENDING"}}\n)`
        : `collection.find({})`;
    case "java":
      return sort
        ? `collection.find(\n    Filter.empty(),\n    new FindOptions()\n        .sort(Sorts.${sort.dir === 1 ? "ascending" : "descending"}("${sort.col}"))\n)`
        : `collection.find(Filter.empty())`;
    case "curl": {
      const body = sort
        ? JSON.stringify({ find: { filter: {}, sort: { [sort.col]: sort.dir } } }, null, 2)
        : JSON.stringify({ find: { filter: {} } }, null, 2);
      return `curl -X POST "$ASTRA_DB_API_ENDPOINT/api/json/v1/$KEYSPACE/${collectionName}" \\\n  -H "Token: $ASTRA_DB_APPLICATION_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
    }
  }
}

export function BrowseCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      onClick={() => void handleCopy()}
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
      style={{
        color: copied ? "var(--step-respond)" : "var(--text-muted)",
        backgroundColor: copied ? "rgba(34,197,94,0.08)" : "transparent",
        border: `1px solid ${copied ? "rgba(34,197,94,0.2)" : "transparent"}`,
      }}
      title="Copy to clipboard"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function renderBrowseCode(lang: BrowseCodeLang, code: string) {
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {lang === "ts" && line
        .replace(/^(await )/, "⟨await⟩")
        .split(/(⟨await⟩|"[^"]*"|\$[a-zA-Z]+|\.find\b|\b(?:db|collection)\b)/g)
        .map((part, j) => {
          if (part === "⟨await⟩") return <span key={j} style={{ color: "var(--interactive)" }}>await </span>;
          if (part.startsWith('"')) return <span key={j} style={{ color: "var(--step-respond)" }}>{part}</span>;
          if (part.startsWith("$")) return <span key={j} style={{ color: "var(--step-embed)" }}>{part}</span>;
          if (part === ".find") return <span key={j} style={{ color: "var(--interactive)" }}>{part}</span>;
          if (part === "db" || part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {lang === "python" && line
        .split(/(from\s+\w+|import\s+\w+|"[^"]*"|\bSortDocuments\b|\bcollection\b)/g)
        .map((part, j) => {
          if (part.startsWith("from ") || part.startsWith("import ")) return <span key={j} style={{ color: "var(--interactive)" }}>{part}</span>;
          if (part.startsWith('"')) return <span key={j} style={{ color: "var(--step-respond)" }}>{part}</span>;
          if (part === "SortDocuments") return <span key={j} style={{ color: "var(--step-embed)" }}>{part}</span>;
          if (part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {lang === "java" && line
        .split(/(new\s+\w+|Filter\.empty\(\)|Sorts\.\w+|"[^"]*"|\bcollection\b)/g)
        .map((part, j) => {
          if (part.startsWith("new ")) return <span key={j} style={{ color: "var(--interactive)" }}>{part}</span>;
          if (part === "Filter.empty()") return <span key={j} style={{ color: "var(--text-muted)" }}>{part}</span>;
          if (part.startsWith("Sorts.")) return <span key={j} style={{ color: "var(--step-embed)" }}>{part}</span>;
          if (part.startsWith('"')) return <span key={j} style={{ color: "var(--step-respond)" }}>{part}</span>;
          if (part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {lang === "curl" && line
        .split(/(curl|-[XHd]|"[^"]*"|\$[A-Z_]+)/g)
        .map((part, j) => {
          if (part === "curl") return <span key={j} style={{ color: "var(--interactive)" }}>{part}</span>;
          if (part === "-X" || part === "-H" || part === "-d") return <span key={j} style={{ color: "var(--text-muted)" }}>{part}</span>;
          if (part.startsWith('"')) return <span key={j} style={{ color: "var(--step-respond)" }}>{part}</span>;
          if (part.startsWith("$")) return <span key={j} style={{ color: "var(--step-embed)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {"\n"}
    </span>
  ));
}
