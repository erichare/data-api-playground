"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Play, Copy, Check } from "lucide-react";
import type { Collection } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type OpId = "find" | "findOne" | "insertMany" | "updateOne" | "deleteOne" | "vectorSearch" | "estimatedCount";
type CodeLang = "ts" | "python" | "java" | "curl";

interface Op {
  id: OpId;
  category: "documents" | "vector" | "collection";
  label: string;
  description: string;
}

// ─── Operation definitions ────────────────────────────────────────────────────

const OPS: Op[] = [
  { id: "find",           category: "documents",  label: "Find",            description: "Retrieve documents with optional filter and limit" },
  { id: "findOne",        category: "documents",  label: "Find One",        description: "Retrieve the first document matching a filter" },
  { id: "insertMany",     category: "documents",  label: "Insert Many",     description: "Insert one or more documents into the collection" },
  { id: "updateOne",      category: "documents",  label: "Update One",      description: "Update the first document matching a filter" },
  { id: "deleteOne",      category: "documents",  label: "Delete One",      description: "Delete the first document matching a filter" },
  { id: "vectorSearch",   category: "vector",     label: "Vector Search",   description: "Find semantically similar documents by vector similarity" },
  { id: "estimatedCount", category: "collection", label: "Estimated Count", description: "Get an estimated count of documents in the collection" },
];

const CATEGORIES: { id: Op["category"]; label: string }[] = [
  { id: "documents",  label: "Documents" },
  { id: "vector",     label: "Vector" },
  { id: "collection", label: "Collection" },
];

const LANG_META: Record<CodeLang, { label: string; badge: string }> = {
  ts:     { label: "TypeScript", badge: "astra-db-ts" },
  python: { label: "Python",     badge: "astrapy" },
  java:   { label: "Java",       badge: "astra-db-java" },
  curl:   { label: "cURL",       badge: "Data API" },
};

// ─── Default bodies ───────────────────────────────────────────────────────────

function getDefaultBody(op: OpId, collection?: Collection): string {
  const hasVectorize = !!collection?.vectorizeService;
  const dim = collection?.vectorDim ?? 3;
  const placeholderVec = Array.from({ length: Math.min(dim, 5) }, (_, i) =>
    parseFloat(((i + 1) * 0.1).toFixed(1))
  );

  const bodies: Record<OpId, unknown> = {
    find:           { find:           { filter: {}, options: { limit: 10 } } },
    findOne:        { findOne:        { filter: {} } },
    insertMany:     { insertMany:     { documents: [{ field: "value" }] } },
    updateOne:      { updateOne:      { filter: {}, update: { $set: { field: "new_value" } } } },
    deleteOne:      { deleteOne:      { filter: {} } },
    vectorSearch:   hasVectorize
      ? { find: { sort: { $vectorize: "sample query text" }, options: { limit: 5, includeSimilarity: true } } }
      : { find: { sort: { $vector: placeholderVec },        options: { limit: 5, includeSimilarity: true } } },
    estimatedCount: { estimatedDocumentCount: {} },
  };

  return JSON.stringify(bodies[op], null, 2);
}

// ─── Code generation ──────────────────────────────────────────────────────────

function getCode(op: OpId, colName: string, body: string, lang: CodeLang, keyspace: string): string {
  const col = colName || "my_collection";
  const ks  = keyspace || "default_keyspace";

  if (lang === "curl") {
    return (
      `curl -sS -X POST \\\n` +
      `  "$ASTRA_DB_ENDPOINT/api/json/v1/${ks}/${col}" \\\n` +
      `  -H "Token: $ASTRA_DB_TOKEN" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '${body}'`
    );
  }

  const snippets: Record<OpId, Record<"ts" | "python" | "java", string>> = {
    find: {
      ts:
`import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${col}");

const docs = await col.find({}, { limit: 10 }).toArray();`,
      python:
`from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${col}")

docs = list(col.find({}, limit=10))`,
      java:
`DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${col}");

List<Document> docs = col.find().toList();`,
    },
    findOne: {
      ts:
`import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${col}");

const doc = await col.findOne({});`,
      python:
`from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${col}")

doc = col.find_one({})`,
      java:
`DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${col}");

Optional<Document> doc = col.findOne(new Filter());`,
    },
    insertMany: {
      ts:
`import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${col}");

const result = await col.insertMany([{ field: "value" }]);`,
      python:
`from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${col}")

result = col.insert_many([{"field": "value"}])`,
      java:
`DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${col}");

InsertManyResult result = col.insertMany(
    List.of(new Document().append("field", "value")));`,
    },
    updateOne: {
      ts:
`import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${col}");

await col.updateOne({}, { $set: { field: "new_value" } });`,
      python:
`from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${col}")

col.update_one({}, {"$set": {"field": "new_value"}})`,
      java:
`DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${col}");

col.updateOne(new Filter(), Updates.set("field", "new_value"));`,
    },
    deleteOne: {
      ts:
`import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${col}");

const result = await col.deleteOne({});`,
      python:
`from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${col}")

result = col.delete_one({})`,
      java:
`DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${col}");

DeleteResult result = col.deleteOne(new Filter());`,
    },
    vectorSearch: {
      ts:
`import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${col}");

const results = await col.find(
  {},
  {
    sort: { $vectorize: "sample query text" },
    limit: 5,
    includeSimilarity: true,
  }
).toArray();`,
      python:
`from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${col}")

results = list(col.find(
    {},
    sort={"$vectorize": "sample query text"},
    limit=5,
    include_similarity=True,
))`,
      java:
`DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${col}");

List<Document> results = col.find(
    new Filter(),
    new FindOptions()
        .sort(Sorts.vectorize("sample query text"))
        .limit(5)
        .includeSimilarity()
).toList();`,
    },
    estimatedCount: {
      ts:
`import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${col}");

const count = await col.estimatedDocumentCount();`,
      python:
`from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${col}")

count = col.estimated_document_count()`,
      java:
`DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${col}");

long count = col.estimatedDocumentCount();`,
    },
  };

  return snippets[op][lang] ?? "";
}

// ─── JSON syntax highlight ────────────────────────────────────────────────────

function HighlightedJson({ json }: { json: string }) {
  const parts: React.ReactNode[] = [];
  // Match keys (string followed by colon), string values, numbers, booleans/null
  const regex = /("(?:[^"\\]|\\.)*")\s*:?|-?\d+\.?\d*(?:[eE][+-]?\d+)?|true|false|null/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(json)) !== null) {
    if (m.index > last) {
      parts.push(<span key={i++} style={{ color: "var(--text-muted)" }}>{json.slice(last, m.index)}</span>);
    }
    const raw = m[0];
    const isKey = raw.startsWith('"') && json[m.index + raw.length]?.trimStart()[0] === ":";
    let color = "var(--text-secondary)";
    if (isKey) color = "var(--step-embed)";
    else if (raw.startsWith('"')) color = "var(--step-respond)";
    else if (raw === "true" || raw === "false" || raw === "null") color = "var(--interactive)";
    else if (/^-?\d/.test(raw)) color = "var(--step-search)";
    parts.push(<span key={i++} style={{ color }}>{raw}</span>);
    last = m.index + raw.length;
  }
  if (last < json.length) {
    parts.push(<span key={i++} style={{ color: "var(--text-muted)" }}>{json.slice(last)}</span>);
  }
  return <>{parts}</>;
}

// ─── Code syntax highlight ────────────────────────────────────────────────────

const TS_KW     = new Set(["import", "from", "const", "await", "new", "async", "export", "return"]);
const PY_KW     = new Set(["from", "import", "list", "os", "def", "return", "True", "False", "None"]);
const JAVA_KW   = new Set(["new", "List", "Optional", "long", "System", "String", "class", "void", "return"]);

function HighlightedCode({ code, lang }: { code: string; lang: CodeLang }) {
  if (lang === "curl") {
    const parts: React.ReactNode[] = [];
    const regex = /\$[A-Z_]+|"[^"]*"|-[sXHd](?=\s)|curl(?=\s)/g;
    let last = 0; let i = 0; let m: RegExpExecArray | null;
    while ((m = regex.exec(code)) !== null) {
      if (m.index > last) parts.push(<span key={i++} style={{ color: "var(--text-secondary)" }}>{code.slice(last, m.index)}</span>);
      const t = m[0];
      const color = t === "curl" ? "var(--interactive)"
        : t.startsWith("$") ? "var(--step-embed)"
        : t.startsWith('"') ? "var(--step-respond)"
        : "var(--text-muted)";
      parts.push(<span key={i++} style={{ color }}>{t}</span>);
      last = m.index + t.length;
    }
    if (last < code.length) parts.push(<span key={i++} style={{ color: "var(--text-secondary)" }}>{code.slice(last)}</span>);
    return <>{parts}</>;
  }

  const kws = lang === "ts" ? TS_KW : lang === "python" ? PY_KW : JAVA_KW;
  const parts: React.ReactNode[] = [];
  const regex = /"[^"]*"|'[^']*'|\b\w+\b/g;
  let last = 0; let i = 0; let m: RegExpExecArray | null;
  while ((m = regex.exec(code)) !== null) {
    if (m.index > last) parts.push(<span key={i++} style={{ color: "var(--text-muted)" }}>{code.slice(last, m.index)}</span>);
    const t = m[0];
    const color = (t.startsWith('"') || t.startsWith("'")) ? "var(--step-respond)"
      : kws.has(t) ? "var(--interactive)"
      : /^[A-Z]/.test(t) ? "var(--step-embed)"
      : "var(--text-secondary)";
    parts.push(<span key={i++} style={{ color }}>{t}</span>);
    last = m.index + t.length;
  }
  if (last < code.length) parts.push(<span key={i++} style={{ color: "var(--text-muted)" }}>{code.slice(last)}</span>);
  return <>{parts}</>;
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button onClick={copy} className="transition-opacity hover:opacity-75" style={{ color: "var(--text-muted)" }}>
      {copied
        ? <Check size={13} style={{ color: "var(--step-respond)" }} />
        : <Copy size={13} />}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ApiExplorerProps {
  collection?: Collection;
  astraToken: string;
  astraEndpoint: string;
  keyspace: string;
}

interface ApiResponse {
  status: number;
  statusText: string;
  latencyMs: number;
  data: unknown;
}

interface ClientCallLogEntry {
  id: string;
  label: string;
  code: string;
  timestamp: string;
}

export function ApiExplorer({ collection, astraToken, astraEndpoint, keyspace }: ApiExplorerProps) {
  const [selectedOp, setSelectedOp] = useState<OpId>("find");
  const [body, setBody]             = useState(() => getDefaultBody("find", collection));
  const [codeLang, setCodeLang]     = useState<CodeLang>("ts");
  const [response, setResponse]     = useState<ApiResponse | null>(null);
  const [running, setRunning]       = useState(false);
  const [bodyError, setBodyError]   = useState("");
  const [clientCalls, setClientCalls] = useState<ClientCallLogEntry[]>([]);
  const [clientCallsLoading, setClientCallsLoading] = useState(true);

  const colName = collection?.name ?? "";
  const ks      = keyspace || "default_keyspace";

  const endpointPath = `…/api/json/v1/${ks}/${colName || "{collection}"}`;

  const selectOp = useCallback((op: OpId) => {
    setSelectedOp(op);
    setBody(getDefaultBody(op, collection));
    setBodyError("");
    setResponse(null);
  }, [collection]);

  const loadClientCalls = useCallback(async () => {
    try {
      const res = await fetch("/api/typescript-client-calls?limit=40");
      if (!res.ok) return;
      const data = await res.json() as { calls?: ClientCallLogEntry[] };
      setClientCalls(data.calls ?? []);
    } catch {
      // Best effort polling for the activity panel.
    } finally {
      setClientCallsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClientCalls();
    const intervalId = window.setInterval(() => {
      void loadClientCalls();
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [loadClientCalls]);

  const run = async () => {
    setBodyError("");
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch {
      setBodyError("Invalid JSON");
      return;
    }
    setRunning(true);
    setResponse(null);
    try {
      const res = await fetch("/api/data-api-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: astraToken,
          endpoint: astraEndpoint,
          keyspace: ks,
          collection: colName,
          requestBody: parsed,
        }),
      });
      const data = await res.json() as ApiResponse & { error?: string };
      if (data.error && !data.status) {
        setResponse({ status: 500, statusText: "Error", latencyMs: 0, data: { error: data.error } });
      } else {
        setResponse(data);
      }
    } catch (err) {
      setResponse({ status: 0, statusText: "Network Error", latencyMs: 0, data: { error: String(err) } });
    } finally {
      setRunning(false);
      void loadClientCalls();
    }
  };

  const code        = getCode(selectedOp, colName, body, codeLang, ks);
  const responseJson = response ? JSON.stringify(response.data, null, 2) : null;
  const statusOk    = response && response.status >= 200 && response.status < 300;
  const hasClientCalls = clientCalls.length > 0;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── Left: Operations ─────────────────────────────────────────────── */}
      <div
        className="flex flex-col w-44 shrink-0 border-r overflow-y-auto"
        style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-panel)" }}
      >
        <div className="px-3 pt-4 pb-1">
          <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Operations
          </p>
        </div>

        {CATEGORIES.map((cat) => {
          const ops = OPS.filter((o) => o.category === cat.id);
          return (
            <div key={cat.id} className="mt-3">
              <p
                className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-muted)" }}
              >
                {cat.label}
              </p>
              {ops.map((op) => {
                const active = selectedOp === op.id;
                return (
                  <button
                    key={op.id}
                    onClick={() => selectOp(op.id)}
                    className="w-full text-left px-3 py-2 text-xs transition-colors"
                    style={{
                      backgroundColor: active ? "var(--interactive-light)" : "transparent",
                      color: active ? "var(--interactive)" : "var(--text-secondary)",
                      borderLeft: `2px solid ${active ? "var(--interactive)" : "transparent"}`,
                    }}
                  >
                    {op.label}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── Center: Request builder ───────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-y-auto">

        {/* Endpoint bar */}
        <div
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-panel)" }}
        >
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: "var(--interactive-light)",
              color: "var(--interactive)",
              fontFamily: "IBM Plex Mono, monospace",
            }}
          >
            POST
          </span>
          <span
            className="text-xs flex-1 truncate"
            style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}
          >
            {endpointPath}
          </span>
          <CopyButton text={`${astraEndpoint}/api/json/v1/${ks}/${colName}`} />
        </div>

        <div className="flex flex-col px-5 py-5 gap-5">

          {/* Description */}
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {OPS.find((o) => o.id === selectedOp)?.description}
          </p>

          {/* Request body */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Request Body
              </span>
              {bodyError && (
                <span className="text-[10px]" style={{ color: "var(--step-search)" }}>{bodyError}</span>
              )}
            </div>
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); setBodyError(""); }}
              rows={10}
              className="w-full text-xs resize-none rounded-lg px-3 py-2.5 outline-none"
              style={{
                backgroundColor: "var(--bg-input)",
                border: `1px solid ${bodyError ? "var(--step-search)" : "var(--border-subtle)"}`,
                color: "var(--text-primary)",
                fontFamily: "IBM Plex Mono, monospace",
                lineHeight: "1.65",
              }}
            />
          </div>

          {/* Run */}
          <div className="flex items-center gap-3">
            <motion.button
              onClick={() => void run()}
              disabled={running || !colName}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
              style={{
                backgroundColor: "var(--interactive)",
                color: "#fff",
                opacity: running || !colName ? 0.45 : 1,
                cursor: running || !colName ? "not-allowed" : "pointer",
              }}
            >
              {running
                ? <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : <Play size={12} />}
              {running ? "Running…" : "Run"}
            </motion.button>
            {!colName && (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Select a collection from the sidebar to run requests
              </span>
            )}
          </div>

          {/* Code panel */}
          <div className="border-t pt-5" style={{ borderColor: "var(--border-subtle)" }}>
            {/* Lang selector + badge */}
            <div className="flex items-center justify-between mb-2.5">
              <div
                className="flex rounded-lg p-0.5 gap-0.5"
                style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
              >
                {(["ts", "python", "java", "curl"] as CodeLang[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setCodeLang(l)}
                    className="px-3 py-1 rounded-md text-[11px] font-medium transition-colors"
                    style={{
                      backgroundColor: codeLang === l ? "var(--bg-panel)" : "transparent",
                      color: codeLang === l ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {LANG_META[l].label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    color: "var(--text-muted)",
                    fontFamily: "IBM Plex Mono, monospace",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {LANG_META[codeLang].badge}
                </span>
                <CopyButton text={code} />
              </div>
            </div>

            <div
              className="rounded-lg px-4 py-3 overflow-x-auto"
              style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
            >
              <pre
                className="text-[11px] leading-relaxed whitespace-pre"
                style={{ fontFamily: "IBM Plex Mono, monospace" }}
              >
                <HighlightedCode code={code} lang={codeLang} />
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Response ───────────────────────────────────────────────── */}
      <div
        className="flex flex-col border-l overflow-hidden"
        style={{
          width: "420px",
          minWidth: "320px",
          borderColor: "var(--border-subtle)",
          backgroundColor: "var(--bg-panel)",
        }}
      >
        <div className="flex flex-col min-h-0" style={{ flex: "0 0 42%" }}>
          {/* Response header */}
          <div
            className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Response
            </span>
            {response && (
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: statusOk ? "rgba(34,197,94,0.1)" : "rgba(255,107,53,0.1)",
                    color: statusOk ? "var(--step-respond)" : "var(--step-search)",
                    fontFamily: "IBM Plex Mono, monospace",
                  }}
                >
                  {response.status} {response.statusText}
                </span>
                {response.latencyMs > 0 && (
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}
                  >
                    {response.latencyMs}ms
                  </span>
                )}
                {responseJson && <CopyButton text={responseJson} />}
              </div>
            )}
          </div>

          {/* Response body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            {!response ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                  {running ? "Running request…" : "Hit Run to see the response"}
                </p>
              </div>
            ) : responseJson ? (
              <pre
                className="text-[11px] leading-relaxed whitespace-pre-wrap break-all"
                style={{ fontFamily: "IBM Plex Mono, monospace" }}
              >
                <HighlightedJson json={responseJson} />
              </pre>
            ) : null}
          </div>
        </div>

        <div
          className="flex flex-col flex-1 min-h-0 border-t"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div
            className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex flex-col gap-0.5">
              <span
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-muted)" }}
              >
                TypeScript Client Log
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Runtime `astra-db-ts` calls across the app
              </span>
            </div>
            {hasClientCalls && (
              <span
                className="text-[10px] px-2 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-subtle)",
                  fontFamily: "IBM Plex Mono, monospace",
                }}
              >
                {clientCalls.length}
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            {!hasClientCalls ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                  {clientCallsLoading
                    ? "Loading runtime call history…"
                    : "Run API requests, chat, browse, or ingest to see live TypeScript client calls here."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {clientCalls.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg overflow-hidden"
                    style={{
                      border: "1px solid var(--border-subtle)",
                      backgroundColor: "var(--bg-card)",
                    }}
                  >
                    <div
                      className="flex items-center justify-between gap-3 px-3 py-2 border-b"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <div className="min-w-0">
                        <p
                          className="text-[11px] font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {entry.label}
                        </p>
                        <p
                          className="text-[10px]"
                          style={{
                            color: "var(--text-muted)",
                            fontFamily: "IBM Plex Mono, monospace",
                          }}
                        >
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                      <CopyButton text={entry.code} />
                    </div>
                    <div className="px-3 py-2 overflow-x-auto">
                      <pre
                        className="text-[11px] leading-relaxed whitespace-pre"
                        style={{ fontFamily: "IBM Plex Mono, monospace" }}
                      >
                        <HighlightedCode code={entry.code} lang="ts" />
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
