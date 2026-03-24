"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SourceCard } from "./SourceCard";
import { PipelineTrace } from "./PipelineTrace";
import type { Message } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
  index: number;
}

const searchModeColors: Record<string, string> = {
  vector: "#6c63ff",
  hybrid: "#ff6b35",
  lexical: "#00c2cb",
};

export function MessageBubble({ message, index }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [showAllSources, setShowAllSources] = useState(false);
  const SOURCE_PREVIEW_COUNT = 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.25,
        ease: "easeOut",
        delay: index * 0.04,
      }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} max-w-full`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{
              background: "linear-gradient(135deg, #6c63ff, #00c2cb)",
              color: "#f8fafc",
            }}
          >
            AI
          </div>
          <div
            className="text-[8px] font-bold px-1 rounded"
            style={{
              backgroundColor: "rgba(15, 98, 254, 0.15)",
              color: "#4589ff",
              fontFamily: "monospace",
              letterSpacing: "-0.02em",
              lineHeight: "1.4",
            }}
            title="Embeddings powered by IBM Granite"
          >
            IBM
          </div>
        </div>
      )}

      {/* Content */}
      <div
        className={`flex flex-col gap-2 ${isUser ? "items-end max-w-[70%]" : "items-start max-w-[85%]"}`}
      >
        {/* Bubble */}
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser ? "rounded-tr-sm" : "rounded-tl-sm"
          }`}
          style={
            isUser
              ? {
                  background:
                    "linear-gradient(135deg, #ff6b35, #ff8c5a)",
                  color: "#f8fafc",
                  boxShadow: "0 2px 12px rgba(255, 107, 53, 0.2)",
                }
              : {
                  backgroundColor: "#13192b",
                  border: "1px solid #1e2d4a",
                  color: "#f8fafc",
                }
          }
        >
          {isUser ? message.content : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong style={{ color: "#f8fafc", fontWeight: 600 }}>{children}</strong>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                code: ({ children }) => <code className="px-1 py-0.5 rounded text-[12px] font-mono" style={{ backgroundColor: "rgba(0,194,203,0.1)", color: "#2dd6e0" }}>{children}</code>,
                h1: ({ children }) => <h1 className="text-base font-bold mb-1.5" style={{ color: "#f8fafc" }}>{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-bold mb-1" style={{ color: "#f8fafc" }}>{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold mb-1" style={{ color: "#e2e8f0" }}>{children}</h3>,
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-2">
                    <table className="w-full text-[12px] border-collapse" style={{ borderColor: "#1e2d4a" }}>{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead style={{ backgroundColor: "rgba(30,45,74,0.6)" }}>{children}</thead>,
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => <tr style={{ borderBottom: "1px solid #1e2d4a" }}>{children}</tr>,
                th: ({ children }) => <th className="px-3 py-1.5 text-left font-semibold" style={{ color: "#94a3b8", borderBottom: "1px solid #2a3a5a" }}>{children}</th>,
                td: ({ children }) => <td className="px-3 py-1.5" style={{ color: "#dde6f0" }}>{children}</td>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {/* Assistant metadata: search mode + latency */}
        {!isUser && message.searchMode && (
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{
                backgroundColor: `${searchModeColors[message.searchMode]}18`,
                color: searchModeColors[message.searchMode],
                border: `1px solid ${searchModeColors[message.searchMode]}30`,
              }}
            >
              {message.searchMode}
            </span>
            {message.latencyMs && (
              <div className="flex items-center gap-1">
                <Zap size={10} style={{ color: "#00c2cb" }} />
                <span className="text-[11px]" style={{ color: "#64748b" }}>
                  {message.latencyMs}ms
                </span>
              </div>
            )}
          </div>
        )}

        {/* Documents (collapsed by default) */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="w-full mt-1 rounded-xl overflow-hidden" style={{ backgroundColor: "#0d1220", border: "1px solid #1e2d4a" }}>
            <button
              onClick={() => setSourcesOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left"
              style={{ backgroundColor: "rgba(30,45,74,0.3)" }}
            >
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {message.sources.slice(0, 4).map((s, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#ff6b35", opacity: 1 - i * 0.18 }} />
                  ))}
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#64748b" }}>
                  {message.sources.length} Document{message.sources.length !== 1 ? "s" : ""} Retrieved
                </span>
              </div>
              <motion.div animate={{ rotate: sourcesOpen ? 180 : 0 }} transition={{ duration: 0.15 }}>
                <ChevronDown size={13} style={{ color: "#475569" }} />
              </motion.div>
            </button>
            <AnimatePresence initial={false}>
              {sourcesOpen && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="flex flex-col gap-1.5 px-2 pb-2 pt-1">
                    {(showAllSources ? message.sources : message.sources.slice(0, SOURCE_PREVIEW_COUNT)).map((source, i) => (
                      <SourceCard key={source.id} source={source} index={i} />
                    ))}
                    {message.sources.length > SOURCE_PREVIEW_COUNT && (
                      <button
                        onClick={() => setShowAllSources((v) => !v)}
                        className="text-[11px] py-1 text-center rounded-lg transition-colors"
                        style={{ color: "#64748b", border: "1px dashed #1e2d4a" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#94a3b8"; (e.currentTarget as HTMLElement).style.borderColor = "#2a3d5e"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#64748b"; (e.currentTarget as HTMLElement).style.borderColor = "#1e2d4a"; }}
                      >
                        {showAllSources ? "Show less" : `+${message.sources.length - SOURCE_PREVIEW_COUNT} more`}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Pipeline trace — less prominent, collapsed by default */}
        {!isUser && message.pipelineSteps && message.pipelineSteps.length > 0 && (
          <div className="w-full" style={{ opacity: 0.6 }}>
            <PipelineTrace steps={message.pipelineSteps} defaultExpanded={false} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
