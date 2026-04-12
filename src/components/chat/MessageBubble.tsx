"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Code2, MessageSquare, Copy, Check, Activity } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PipelineTrace } from "./PipelineTrace";
import type { Message, PipelineStep } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
  index: number;
  streaming?: boolean;
}

type CodeLang = "ts" | "python" | "java" | "curl";

const LANG_LABELS: Record<CodeLang, string> = { ts: "TypeScript", python: "Python", java: "Java", curl: "cURL" };
const LANG_SDK: Record<CodeLang, string> = {
  ts: "astra-db-ts",
  python: "astrapy",
  java: "astra-db-java",
  curl: "Data API",
};

// ── Code generators ──────────────────────────────────────────────────────────

function toPythonCommand(tsCmd: string): string {
  const limit = tsCmd.match(/limit:\s*(\d+)/)?.[1] ?? "5";
  if (tsCmd.includes(".findAndRerank(")) {
    return `collection.find_and_rerank(\n    {},\n    sort={"$hybrid": {"$vectorize": query}},\n    limit=${limit}\n)`;
  }
  if (tsCmd.includes("$vectorize")) {
    return `collection.find(\n    {},\n    sort={"$vectorize": query},\n    limit=${limit},\n    include_similarity=True\n)`;
  }
  if (tsCmd.includes("$vector")) {
    return `collection.find(\n    {},\n    sort={"$vector": embedding},\n    limit=${limit},\n    include_similarity=True\n)`;
  }
  const sortMatch = tsCmd.match(/sort:\s*\{\s*(\w+):\s*(-?1)/);
  if (sortMatch) {
    const dir = sortMatch[2] === "1" ? "ASCENDING" : "DESCENDING";
    return `from astrapy.constants import SortDocuments\ncollection.find(\n    {},\n    sort={"${sortMatch[1]}": SortDocuments.${dir}},\n    limit=${limit}\n)`;
  }
  return `collection.find({}, limit=${limit})`;
}

function toJavaCommand(tsCmd: string): string {
  const limit = tsCmd.match(/limit:\s*(\d+)/)?.[1] ?? "5";
  if (tsCmd.includes(".findAndRerank(")) {
    return `collection.findAndRerank(\n    Filter.empty(),\n    new FindOneAndRerankOptions()\n        .sort(Sorts.hybrid(query))\n        .limit(${limit})\n)`;
  }
  if (tsCmd.includes("$vectorize")) {
    return `collection.find(\n    Filter.empty(),\n    new FindOptions()\n        .sort(Sorts.vectorize(query))\n        .limit(${limit})\n)`;
  }
  if (tsCmd.includes("$vector")) {
    return `collection.find(\n    Filter.empty(),\n    new FindOptions()\n        .sort(Sorts.vector(embedding))\n        .limit(${limit})\n)`;
  }
  const sortMatch = tsCmd.match(/sort:\s*\{\s*(\w+):\s*(-?1)/);
  if (sortMatch) {
    const dir = sortMatch[2] === "1" ? "ascending" : "descending";
    return `collection.find(\n    Filter.empty(),\n    new FindOptions()\n        .sort(Sorts.${dir}("${sortMatch[1]}"))\n        .limit(${limit})\n)`;
  }
  return `collection.find(Filter.empty(), new FindOptions().limit(${limit}))`;
}

function toCurlCommand(tsCmd: string, collection?: string): string {
  const limit = tsCmd.match(/limit:\s*(\d+)/)?.[1] ?? "5";
  const col = collection ?? "<COLLECTION>";
  const endpoint = `"$ASTRA_DB_API_ENDPOINT/api/json/v1/$KEYSPACE/${col}"`;
  const headers = `-H "Token: $ASTRA_DB_APPLICATION_TOKEN" \\\n  -H "Content-Type: application/json"`;

  let body: string;
  if (tsCmd.includes(".findAndRerank(")) {
    body = JSON.stringify({
      findAndRerank: {
        filter: {},
        sort: { $hybrid: { $vectorize: "<query>" } },
        options: { limit: Number(limit) },
      }
    }, null, 2);
  } else if (tsCmd.includes("$vectorize")) {
    body = JSON.stringify({
      find: {
        filter: {},
        sort: { $vectorize: "<query>" },
        options: { limit: Number(limit), includeSimilarity: true },
      }
    }, null, 2);
  } else if (tsCmd.includes("$vector")) {
    body = JSON.stringify({
      find: {
        filter: {},
        sort: { $vector: ["<embedding>"] },
        options: { limit: Number(limit), includeSimilarity: true },
      }
    }, null, 2);
  } else {
    const sortMatch = tsCmd.match(/sort:\s*\{\s*(\w+):\s*(-?1)/);
    if (sortMatch) {
      body = JSON.stringify({
        find: {
          filter: {},
          sort: { [sortMatch[1]]: Number(sortMatch[2]) },
          options: { limit: Number(limit) },
        }
      }, null, 2);
    } else {
      body = JSON.stringify({ find: { filter: {}, options: { limit: Number(limit) } } }, null, 2);
    }
  }

  return `curl -X POST ${endpoint} \\\n  ${headers} \\\n  -d '${body}'`;
}

function getCodeForLang(lang: CodeLang, searchStep?: PipelineStep): string {
  const command = searchStep?.data?.command as string | undefined;
  const collection = searchStep?.data?.collection as string | undefined;
  if (!command) return "# No search was executed for this response";

  switch (lang) {
    case "ts": {
      const lines = command.split("\n");
      return `await db.collection("${collection ?? "…"}")\n${lines.slice(1).map((l) => "  " + l.trim()).join("\n")}`;
    }
    case "python": return toPythonCommand(command);
    case "java": return toJavaCommand(command);
    case "curl": return toCurlCommand(command, collection);
  }
}

// ── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
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
        color: copied ? "#22c55e" : "var(--text-muted)",
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

// ── CodeTab ───────────────────────────────────────────────────────────────────

function CodeTab({ searchStep }: { searchStep?: PipelineStep }) {
  const [lang, setLang] = useState<CodeLang>("ts");
  const code = getCodeForLang(lang, searchStep);

  return (
    <div className="flex flex-col gap-0 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
      {/* Language selector bar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-subtle)" }}
      >
        <div className="flex gap-0.5">
          {(Object.keys(LANG_LABELS) as CodeLang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
              style={{
                backgroundColor: lang === l ? "var(--interactive-light)" : "transparent",
                color: lang === l ? "var(--interactive)" : "var(--text-muted)",
                border: lang === l ? "1px solid var(--interactive-border)" : "1px solid transparent",
              }}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}>
            {LANG_SDK[lang]}
          </span>
          <CopyButton text={code} />
        </div>
      </div>

      {/* Code block */}
      <div style={{ backgroundColor: "var(--bg-card)" }}>
        <pre
          className="text-[12px] px-4 py-3 overflow-x-auto leading-relaxed"
          style={{
            fontFamily: "IBM Plex Mono, monospace",
            color: "var(--text-secondary)",
            whiteSpace: "pre",
            margin: 0,
          }}
        >
          {lang === "ts" && renderTsCode(code)}
          {lang === "python" && renderPythonCode(code)}
          {lang === "java" && renderJavaCode(code)}
          {lang === "curl" && renderCurlCode(code)}
        </pre>
      </div>
    </div>
  );
}

// Simple syntax highlighting helpers
function Kw({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--interactive)" }}>{children}</span>;
}
function Str({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--step-respond)" }}>{children}</span>;
}
function Key({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--step-embed)" }}>{children}</span>;
}
function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--text-muted)" }}>{children}</span>;
}

function renderTsCode(code: string) {
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {line
        .replace(/^(await )/, "⟨await⟩")
        .split(/(⟨await⟩|"[^"]*"|\$[a-zA-Z]+|\.find(?:AndRerank)?|\b(?:db|collection)\b)/g)
        .map((part, j) => {
          if (part === "⟨await⟩") return <Kw key={j}>await </Kw>;
          if (part.startsWith('"')) return <Str key={j}>{part}</Str>;
          if (part.startsWith("$")) return <Key key={j}>{part}</Key>;
          if (part === ".find" || part === ".findAndRerank") return <Kw key={j}>{part}</Kw>;
          if (part === "db" || part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {"\n"}
    </span>
  ));
}

function renderPythonCode(code: string) {
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {line
        .split(/(from\s+\w+|import\s+\w+|"[^"]*"|'\$[^']*'|\$\w+|\b(?:collection|SortDocuments)\b)/g)
        .map((part, j) => {
          if (part.startsWith("from ") || part.startsWith("import ")) return <Kw key={j}>{part}</Kw>;
          if (part.startsWith('"') || part.startsWith("'")) return <Str key={j}>{part}</Str>;
          if (part.startsWith("$")) return <Key key={j}>{part}</Key>;
          if (part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {"\n"}
    </span>
  ));
}

function renderJavaCode(code: string) {
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {line
        .split(/(new\s+\w+|Filter\.empty\(\)|Sorts\.\w+|"[^"]*"|\b(?:collection)\b)/g)
        .map((part, j) => {
          if (part.startsWith("new ")) return <Kw key={j}>{part}</Kw>;
          if (part === "Filter.empty()") return <Muted key={j}>{part}</Muted>;
          if (part.startsWith("Sorts.")) return <Key key={j}>{part}</Key>;
          if (part.startsWith('"')) return <Str key={j}>{part}</Str>;
          if (part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {"\n"}
    </span>
  ));
}

function renderCurlCode(code: string) {
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {line
        .split(/(curl|-[XH]|"[^"]*"|\$[A-Z_]+|'[\s\S]*')/g)
        .map((part, j) => {
          if (part === "curl") return <Kw key={j}>{part}</Kw>;
          if (part === "-X" || part === "-H") return <Muted key={j}>{part}</Muted>;
          if (part.startsWith('"')) return <Str key={j}>{part}</Str>;
          if (part.startsWith("$")) return <Key key={j}>{part}</Key>;
          return <span key={j}>{part}</span>;
        })}
      {"\n"}
    </span>
  ));
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

export function MessageBubble({
  message,
  index,
  streaming = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [activeTab, setActiveTab] = useState<"output" | "code" | "trace">("output");

  const searchStep = message.pipelineSteps?.find((s) => s.id === "search");
  const hasSearchCode = !!searchStep?.data?.command;
  const hasPipelineSteps = !!message.pipelineSteps?.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut", delay: index * 0.04 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} max-w-full`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: "linear-gradient(135deg, var(--step-analyze), var(--step-embed))", color: "#fff" }}
          >
            AI
          </div>
          <div
            className="text-[8px] font-bold px-1 rounded"
            style={{
              backgroundColor: "var(--interactive-light)",
              color: "var(--interactive)",
              fontFamily: "IBM Plex Mono, monospace",
              lineHeight: "1.4",
            }}
            title="Powered by IBM Granite"
          >
            IBM
          </div>
        </div>
      )}

      {/* Content */}
      <div className={`flex flex-col gap-2 ${isUser ? "items-end max-w-[70%]" : "items-start max-w-[90%] w-full"}`}>

        {/* User bubble */}
        {isUser && (
          <div
            className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
            style={{
              backgroundColor: "var(--interactive-light)",
              border: "1px solid var(--interactive-border)",
              color: "var(--text-primary)",
            }}
          >
            {message.content}
          </div>
        )}

        {/* Assistant response with tabs */}
        {!isUser && (
          <div className="w-full flex flex-col gap-2">
            {/* Tab bar */}
            {(hasSearchCode || hasPipelineSteps) && (
              <div
                className="flex items-center gap-0.5 p-0.5 rounded-lg self-start"
                style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
              >
                <button
                  onClick={() => setActiveTab("output")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: activeTab === "output" ? "var(--bg-panel)" : "transparent",
                    color: activeTab === "output" ? "var(--text-primary)" : "var(--text-muted)",
                    boxShadow: activeTab === "output" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  <MessageSquare size={11} />
                  Output
                </button>
                {hasSearchCode && (
                  <button
                    onClick={() => setActiveTab("code")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: activeTab === "code" ? "var(--bg-panel)" : "transparent",
                      color: activeTab === "code" ? "var(--interactive)" : "var(--text-muted)",
                      boxShadow: activeTab === "code" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    }}
                  >
                    <Code2 size={11} />
                    Code
                  </button>
                )}
                {hasPipelineSteps && (
                  <button
                    onClick={() => setActiveTab("trace")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: activeTab === "trace" ? "var(--bg-panel)" : "transparent",
                      color: activeTab === "trace" ? "var(--step-analyze)" : "var(--text-muted)",
                      boxShadow: activeTab === "trace" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    }}
                  >
                    <Activity size={11} />
                    Trace
                  </button>
                )}
              </div>
            )}

            <AnimatePresence mode="wait" initial={false}>
              {activeTab === "output" ? (
                <motion.div
                  key="output"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col gap-2"
                >
                  {/* Response bubble */}
                  <div
                    className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
                    style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{children}</strong>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        code: ({ children }) => (
                          <code
                            className="px-1.5 py-0.5 rounded text-[12px]"
                            style={{ backgroundColor: "var(--interactive-light)", color: "var(--interactive-text)", fontFamily: "IBM Plex Mono, monospace" }}
                          >
                            {children}
                          </code>
                        ),
                        h1: ({ children }) => <h1 className="text-base font-bold mb-1.5" style={{ color: "var(--text-primary)" }}>{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>{children}</h3>,
                        table: ({ children }) => (
                          <div className="overflow-x-auto mb-2">
                            <table className="w-full text-[12px] border-collapse">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead style={{ backgroundColor: "var(--bg-hover)" }}>{children}</thead>,
                        tbody: ({ children }) => <tbody>{children}</tbody>,
                        tr: ({ children }) => <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>{children}</tr>,
                        th: ({ children }) => <th className="px-3 py-1.5 text-left font-semibold" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-strong)" }}>{children}</th>,
                        td: ({ children }) => <td className="px-3 py-1.5" style={{ color: "var(--text-secondary)" }}>{children}</td>,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                    {streaming && (
                      <span
                        aria-hidden="true"
                        className="inline-block ml-1 h-4 w-1.5 rounded-sm animate-pulse"
                        style={{ backgroundColor: "var(--interactive)", verticalAlign: "text-bottom" }}
                      />
                    )}
                    {message.latencyMs && !streaming && (
                      <div className="flex justify-end mt-1.5">
                        <span
                          className="text-[10px]"
                          style={{
                            color: "var(--text-muted)",
                            fontFamily: "IBM Plex Mono, monospace",
                            opacity: 0.6,
                          }}
                        >
                          {message.latencyMs < 1000
                            ? `${message.latencyMs}ms`
                            : `${(message.latencyMs / 1000).toFixed(1)}s`}
                        </span>
                      </div>
                    )}
                  </div>

                </motion.div>
              ) : activeTab === "code" ? (
                <motion.div
                  key="code"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="w-full"
                >
                  <CodeTab searchStep={searchStep} />
                </motion.div>
              ) : (
                <motion.div
                  key="trace"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="w-full flex flex-col gap-3"
                >
                  <PipelineTrace steps={message.pipelineSteps ?? []} defaultExpanded={true} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}
