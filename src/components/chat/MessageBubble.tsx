"use client";
/* eslint-disable security/detect-object-injection -- Message rendering indexes typed pipeline/source records for display only. */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code2,
  MessageSquare,
  Copy,
  Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  Message,
  PipelineStep,
  PipelineStepId,
} from "@/lib/types";
import { StepDataPreview } from "./PipelineTrace";
import { PipelineSummary, hasStepDetails } from "./PipelineSummary";
import {
  type CodeLang,
  LANG_LABELS,
  LANG_SDK,
  getCodeForLang,
} from "./messageCodeGenerators";
import {
  renderTsCode,
  renderPythonCode,
  renderJavaCode,
  renderCurlCode,
} from "./codeSyntaxHighlight";

interface MessageBubbleProps {
  message: Message;
  index: number;
  streaming?: boolean;
}

// ── CopyButton ───────────────────────────────────────────────────────────────

const COPY_FEEDBACK_MS = 1800;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
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

// ── CodeTab ──────────────────────────────────────────────────────────────────

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

// ── MessageBubble ────────────────────────────────────────────────────────────

export function MessageBubble({
  message,
  index,
  streaming = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [activeTab, setActiveTab] = useState<"output" | "code">("output");
  const [activePipelineStepId, setActivePipelineStepId] =
    useState<PipelineStepId | null>(null);
  const expandedStepPanelRef = useRef<HTMLDivElement | null>(null);

  const searchStep = message.pipelineSteps?.find((s) => s.id === "search");
  const hasSearchCode = !!searchStep?.data?.command;
  const hasPipelineSteps = !!message.pipelineSteps?.length;
  const resolvedActivePipelineStepId =
    activePipelineStepId &&
    message.pipelineSteps?.some((step) => step.id === activePipelineStepId)
      ? activePipelineStepId
      : null;
  const activePipelineStep =
    message.pipelineSteps?.find((step) => step.id === resolvedActivePipelineStepId) ?? null;
  const responseContent =
    message.content.trim().length > 0
      ? message.content
      : streaming
        ? "Working through the pipeline..."
        : "";
  const showFooter = hasPipelineSteps || hasSearchCode || !!message.latencyMs;

  const togglePipelineStep = (stepId: PipelineStepId) => {
    setActivePipelineStepId((current) => (current === stepId ? null : stepId));
  };

  useEffect(() => {
    if (!resolvedActivePipelineStepId) return;

    const timeoutId = window.setTimeout(() => {
      expandedStepPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
        inline: "nearest",
      });
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [resolvedActivePipelineStepId]);

  return (
    <motion.div
      initial={streaming ? false : { opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        streaming
          ? { duration: 0.12, ease: "easeOut" }
          : { duration: 0.25, ease: "easeOut", delay: index * 0.04 }
      }
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

        {/* Assistant response with an inline pipeline footer */}
        {!isUser && (
          <div
            className="w-full overflow-hidden rounded-[24px]"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 14px 32px rgba(0,0,0,0.14)",
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {activeTab === "output" ? (
                <motion.div
                  key="output"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col"
                >
                  <div
                    className="px-4 py-3.5 text-sm leading-relaxed"
                    style={{ color: "var(--text-primary)" }}
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
                      {responseContent}
                    </ReactMarkdown>
                    {streaming && (
                      <span
                        aria-hidden="true"
                        className="inline-block ml-1 h-4 w-1.5 rounded-sm animate-pulse"
                        style={{ backgroundColor: "var(--interactive)", verticalAlign: "text-bottom" }}
                      />
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="code"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="w-full p-3"
                >
                  <CodeTab searchStep={searchStep} />
                </motion.div>
              )}
            </AnimatePresence>

            {showFooter && (
              <div
                className="border-t"
                style={{
                  backgroundColor: "rgba(255,255,255,0.02)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {hasPipelineSteps && (
                      <PipelineSummary
                        steps={message.pipelineSteps ?? []}
                        activeStepId={resolvedActivePipelineStepId}
                        onToggleStep={togglePipelineStep}
                      />
                    )}
                    {message.latencyMs && !streaming && (
                      <span
                        className="text-[10px]"
                        style={{
                          color: "var(--text-muted)",
                          fontFamily: "IBM Plex Mono, monospace",
                          opacity: 0.8,
                        }}
                      >
                        {message.latencyMs < 1000
                          ? `${message.latencyMs}ms`
                          : `${(message.latencyMs / 1000).toFixed(1)}s`}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {hasSearchCode && (
                      <div
                        className="flex items-center gap-0.5 rounded-full p-0.5"
                        style={{
                          backgroundColor: "var(--bg-panel)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <button
                          onClick={() => setActiveTab("output")}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                          style={{
                            backgroundColor:
                              activeTab === "output" ? "var(--bg-hover)" : "transparent",
                            color:
                              activeTab === "output"
                                ? "var(--text-primary)"
                                : "var(--text-muted)",
                          }}
                        >
                          <MessageSquare size={11} />
                          Output
                        </button>
                        <button
                          onClick={() => setActiveTab("code")}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                          style={{
                            backgroundColor:
                              activeTab === "code" ? "var(--bg-hover)" : "transparent",
                            color:
                              activeTab === "code"
                                ? "var(--interactive)"
                                : "var(--text-muted)",
                          }}
                        >
                          <Code2 size={11} />
                          Code
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {activePipelineStep?.data && hasStepDetails(activePipelineStep) && (
                    <motion.div
                      key={activePipelineStep.id}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        ref={expandedStepPanelRef}
                        className="px-3 pb-3"
                        style={{ scrollMarginBottom: "24px" }}
                      >
                        <div
                          className="rounded-2xl px-3 py-2.5"
                          style={{
                            backgroundColor: "var(--bg-panel)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <StepDataPreview
                            stepId={activePipelineStep.id}
                            data={activePipelineStep.data}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
