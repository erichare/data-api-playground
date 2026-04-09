"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, MessageSquare, RefreshCw, AlertCircle, X } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { PipelineTrace } from "./PipelineTrace";
import { SearchModeToggle } from "./SearchModeToggle";
import type { Message, SearchMode, Conversation, PipelineStep, PipelineStepId } from "@/lib/types";

interface ChatAreaProps {
  conversations: Conversation[];
  activeConversationId: string;
  messages: Message[];
  onMessagesUpdate: (messages: Message[]) => void;
  astraToken?: string;
  astraEndpoint?: string;
  keyspace?: string;
  collections?: { name: string; isVectorize: boolean; vectorDimension?: number | null }[];
  activeCollection?: string;
  huggingfaceApiKey?: string;
  collectionFields?: Record<string, string[]>;
  isConnected?: boolean;
  initializing?: boolean;
}

export function ChatArea({
  conversations,
  activeConversationId,
  messages,
  onMessagesUpdate,
  astraToken,
  astraEndpoint,
  keyspace,
  collections,
  activeCollection,
  huggingfaceApiKey,
  collectionFields,
  isConnected = false,
  initializing = false,
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [streamingSteps, setStreamingSteps] = useState<PipelineStep[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sendRipple, setSendRipple] = useState(false);
  const [chatError, setChatError] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeConv = conversations.find((c) => c.id === activeConversationId);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming, streamingSteps]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setSendRipple(true);
    setTimeout(() => setSendRipple(false), 600);

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const updated = [...messages, userMsg];
    onMessagesUpdate(updated);
    setInput("");
    setIsStreaming(true);
    setStreamingSteps([]);
    setChatError("");

    const liveSteps: PipelineStep[] = [];

    const upsertStep = (partial: Partial<PipelineStep> & { id: PipelineStepId }) => {
      const idx = liveSteps.findIndex((s) => s.id === partial.id);
      if (idx >= 0) {
        liveSteps[idx] = { ...liveSteps[idx], ...partial };
      } else {
        liveSteps.push({ status: "pending", ...partial } as PipelineStep);
      }
      setStreamingSteps([...liveSteps]);
    };

    let finalContent = "";
    let finalSearchMode: string = searchMode;
    let totalMs = 0;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          query: text,
          searchMode,
          token: astraToken,
          endpoint: astraEndpoint,
          keyspace: keyspace || undefined,
          collections: collections ?? [],
          activeCollection: activeCollection ?? "",
          huggingfaceApiKey: huggingfaceApiKey || undefined,
          allCollectionFields: collectionFields ?? {},
          history: messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role,
              content: m.role === "assistant" && m.sources && m.sources.length > 0
                ? `${m.content}\n\n[Search results shown to user:]\n${m.sources.map((s, i) =>
                    `[${i + 1}] ${Object.entries(s.preview).map(([k, v]) => `${k}: ${v}`).join(" | ")}`
                  ).join("\n")}`
                : m.content,
            })),
        }),
      });

      if (!res.body) throw new Error("No response body");
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let event: any;
          try { event = JSON.parse(line); } catch { continue; }

          if (event.error && !event.step) {
            const requestId = event.requestId ? ` (request ${event.requestId})` : "";
            throw new Error(`${event.error}${requestId}`);
          }

          if (event.step && event.status) {
            upsertStep({
              id: event.step as PipelineStepId,
              status: event.status,
              latencyMs: event.latencyMs,
              data: event.data,
            });
            if (event.status === "complete" && event.latencyMs) totalMs += event.latencyMs;
            if (event.step === "analyze" && event.status === "complete" && event.data?.searchMode) {
              finalSearchMode = String(event.data.searchMode);
            }
            if (event.step === "respond" && event.status === "complete" && event.data?.content) {
              finalContent = String(event.data.content);
            }
            if (event.step === "respond" && event.status === "error") {
              finalContent = `Error: ${event.data?.error ?? "Failed to generate response"}`;
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred while processing your query.";
      setChatError(message);
      finalContent = `Error: ${message}`;
    }

    setIsStreaming(false);

    const completedSteps = [...liveSteps];
    const searchStep = completedSteps.find((s) => s.id === "search");
    const rawResults = searchStep?.data?.results as Array<{ id: string; similarity: number; preview: Record<string, string | number>; collection?: string }> | undefined;
    const searchCollection = String(searchStep?.data?.collection ?? "documents");
    const sources = rawResults?.map((r) => ({
      collection: r.collection ?? searchCollection,
      id: r.id,
      similarity: r.similarity,
      preview: r.preview,
    }));

    const assistantMsg: Message = {
      id: `msg-${Date.now() + 1}`,
      role: "assistant",
      content: finalContent || "I searched your collections and found relevant results based on your query.",
      searchMode: finalSearchMode as SearchMode,
      latencyMs: totalMs || undefined,
      timestamp: new Date(),
      pipelineSteps: completedSteps,
      sources,
    };
    onMessagesUpdate([...updated, assistantMsg]);
    setStreamingSteps([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-panel)" }}
      >
        <div className="flex items-center gap-2 px-2 py-1.5">
          <MessageSquare size={14} style={{ color: "var(--interactive)" }} />
          <span className="text-sm font-medium truncate max-w-[200px]" style={{ color: "var(--text-primary)" }}>
            {activeConv?.name ?? "Conversation"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        {isEmpty ? (
          <EmptyState
            onHintClick={(hint) => { setInput(hint); inputRef.current?.focus(); }}
            isConnected={isConnected}
            initializing={initializing}
            collectionFields={collectionFields ?? {}}
            collections={collections?.map((c) => c.name).filter((n) => !n.startsWith("dap_")) ?? []}
            activeCollection={activeCollection}
          />
        ) : (
          <div className="flex flex-col gap-6 max-w-3xl mx-auto">
            {messages.map((msg, i) => (
              <MessageBubble key={msg.id} message={msg} index={i} />
            ))}
            <AnimatePresence>
              {isStreaming && streamingSteps.length > 0 && (
                <motion.div
                  key="pipeline-live"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex gap-3"
                >
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: "linear-gradient(135deg, var(--step-analyze), var(--step-embed))", color: "#fff" }}
                    >
                      AI
                    </div>
                    <div
                      className="text-[8px] font-bold px-1 rounded"
                      style={{ backgroundColor: "var(--interactive-light)", color: "var(--interactive)", fontFamily: "IBM Plex Mono, monospace", lineHeight: "1.4" }}
                    >
                      IBM
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <PipelineTrace steps={streamingSteps} defaultExpanded={true} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="px-4 py-3 border-t shrink-0"
        style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-panel)" }}
      >
        <div className="max-w-3xl mx-auto">
          {chatError && (
            <div
              className="mb-3 flex items-start justify-between gap-3 rounded-xl px-3 py-2.5"
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
              data-testid="chat-error-banner"
            >
              <div className="flex items-start gap-2">
                <AlertCircle size={14} style={{ color: "#ef4444", marginTop: "1px", flexShrink: 0 }} />
                <span className="text-xs leading-relaxed" style={{ color: "#fca5a5" }}>
                  {chatError}
                </span>
              </div>
              <button
                onClick={() => setChatError("")}
                style={{ color: "#fca5a5" }}
                aria-label="Dismiss chat error"
              >
                <X size={12} />
              </button>
            </div>
          )}
          <div
            className="flex flex-col rounded-xl overflow-hidden"
            style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-subtle)" }}
          >
            {/* Text input */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your data..."
              data-testid="chat-input"
              rows={1}
              className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm outline-none"
              style={{
                color: "var(--text-primary)",
                maxHeight: "120px",
                minHeight: "44px",
              }}
            />

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-3 pb-2.5 pt-1 gap-2">
              <SearchModeToggle value={searchMode} onChange={setSearchMode} />

              <motion.button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isStreaming}
                data-testid="chat-send-button"
                className="relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold overflow-hidden transition-colors shrink-0"
                style={{
                  backgroundColor: input.trim() && !isStreaming ? "var(--interactive)" : "var(--bg-hover)",
                  color: input.trim() && !isStreaming ? "#fff" : "var(--text-muted)",
                  cursor: input.trim() && !isStreaming ? "pointer" : "not-allowed",
                  boxShadow: input.trim() && !isStreaming ? "0 2px 8px var(--interactive-border)" : "none",
                }}
                whileHover={input.trim() && !isStreaming ? { scale: 1.03 } : {}}
                whileTap={input.trim() && !isStreaming ? { scale: 0.96 } : {}}
              >
                {sendRipple && (
                  <motion.span
                    className="absolute inset-0 rounded-lg"
                    initial={{ scale: 0, opacity: 0.4 }}
                    animate={{ scale: 2.5, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    style={{ backgroundColor: "var(--interactive)" }}
                  />
                )}
                <Send size={12} />
                Send
              </motion.button>
            </div>
          </div>

          <p className="text-[11px] mt-2 text-center" style={{ color: "var(--text-muted)" }}>
            Press{" "}
            <kbd
              className="px-1 py-0.5 rounded text-[10px]"
              style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", fontFamily: "IBM Plex Mono, monospace" }}
            >
              Enter
            </kbd>{" "}
            to send ·{" "}
            <kbd
              className="px-1 py-0.5 rounded text-[10px]"
              style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", fontFamily: "IBM Plex Mono, monospace" }}
            >
              Shift+Enter
            </kbd>{" "}
            for new line
          </p>
        </div>
      </div>
    </div>
  );
}

function buildSuggestions(
  collections: string[],
  collectionFields: Record<string, string[]>,
  activeCollection?: string,
): string[] {
  const suggestions: string[] = [];
  const activeFields = activeCollection ? (collectionFields[activeCollection] ?? []) : [];

  // Cross-collection exploration (only when multiple collections exist)
  if (collections.length > 1) {
    suggestions.push("Tell me about my data");
    suggestions.push(`What collections do I have and what's in each?`);
  }

  // Active collection overview
  if (activeCollection) {
    suggestions.push(`Show me 5 records from ${activeCollection}`);
    suggestions.push(`What fields are available in ${activeCollection}?`);
  }

  // Field-based suggestions for active collection
  for (const field of activeFields.slice(0, 6)) {
    const lower = field.toLowerCase();
    if (/price|cost|amount|total|salary|revenue|score|rating|count|num|qty|quantity/.test(lower)) {
      suggestions.push(`What are the top 5 records by ${field}?`);
      suggestions.push(`Show me records with the lowest ${field}`);
    } else if (/date|time|created|updated|at$/.test(lower)) {
      suggestions.push(`Show me the most recent records by ${field}`);
    } else if (/name|title|label|description|text|content/.test(lower)) {
      suggestions.push(`Find records where ${field} mentions `);
    } else if (/status|type|category|kind|tag/.test(lower)) {
      suggestions.push(`What are the distinct values of ${field}?`);
    } else {
      suggestions.push(`Filter by ${field}`);
    }
    if (suggestions.length >= 8) break;
  }

  // Other collections (one suggestion each, up to 2)
  const others = collections.filter((c) => c !== activeCollection).slice(0, 2);
  for (const col of others) {
    if (suggestions.length >= 8) break;
    const fields = collectionFields[col] ?? [];
    if (fields.length > 0) {
      suggestions.push(`Show me records from ${col} with high ${fields[0]}`);
    } else {
      suggestions.push(`Show me 5 records from ${col}`);
    }
  }

  // Deduplicate and cap at 8
  return [...new Set(suggestions)].slice(0, 8);
}

function EmptyState({
  onHintClick,
  isConnected,
  initializing,
  collectionFields = {},
  collections = [],
  activeCollection,
}: {
  onHintClick: (hint: string) => void;
  isConnected: boolean;
  initializing?: boolean;
  collectionFields?: Record<string, string[]>;
  collections?: string[];
  activeCollection?: string;
}) {
  const suggestions = buildSuggestions(collections, collectionFields, activeCollection);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center h-full gap-6 py-16"
    >
      {initializing ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <RefreshCw size={12} className="animate-spin" />
          <span>Restoring session…</span>
        </motion.div>
      ) : !isConnected ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{
            backgroundColor: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.3)",
            color: "#fbbf24",
          }}
        >
          <span className="text-base">⚠</span>
          <span>Demo mode — connect to Astra DB to query real data</span>
        </motion.div>
      ) : null}

      <div className="text-center">
        <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          Ask anything about your data
        </h3>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Use vector, hybrid, or lexical search to explore your collections
        </p>
      </div>

      {suggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="w-full max-w-xl"
        >
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-2.5 text-center" style={{ color: "var(--text-muted)" }}>
            Suggested queries
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onHintClick(s)}
                className="px-3 py-1.5 rounded-lg text-xs transition-all text-left"
                style={{ backgroundColor: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.color = "var(--interactive)";
                  el.style.borderColor = "var(--interactive-border)";
                  el.style.backgroundColor = "var(--interactive-light)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.color = "var(--text-secondary)";
                  el.style.borderColor = "var(--border-subtle)";
                  el.style.backgroundColor = "var(--bg-card)";
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
