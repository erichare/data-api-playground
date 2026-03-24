"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, MessageSquare, RefreshCw } from "lucide-react";
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
  collections?: { name: string; isVectorize: boolean }[];
  activeCollection?: string;
  ibmApiKey?: string;
  watsonxProjectId?: string;
  collectionFields?: Record<string, string[]>;
  initializing?: boolean;
}

export function ChatArea({
  conversations,
  activeConversationId,
  messages,
  onMessagesUpdate,
  astraToken,
  astraEndpoint,
  collections,
  activeCollection,
  ibmApiKey,
  watsonxProjectId,
  collectionFields,
  initializing = false,
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [streamingSteps, setStreamingSteps] = useState<PipelineStep[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sendRipple, setSendRipple] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState<"ts" | "python" | "java">("ts");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeConv = conversations.find((c) => c.id === activeConversationId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming, streamingSteps]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    // Ripple effect
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
          collections: collections ?? [],
          activeCollection: activeCollection ?? "",
          ibmApiKey: ibmApiKey || undefined,
          watsonxProjectId: watsonxProjectId || undefined,
          collectionFields: activeCollection && collectionFields?.[activeCollection]
            ? collectionFields[activeCollection]
            : undefined,
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
          try {
            event = JSON.parse(line);
          } catch {
            continue; // skip malformed lines
          }

          // Top-level error from server (outside step flow)
          if (event.error && !event.step) throw new Error(event.error);

          if (event.step && event.status) {
            upsertStep({
              id: event.step as PipelineStepId,
              status: event.status,
              latencyMs: event.latencyMs,
              data: event.data,
            });

            if (event.status === "complete" && event.latencyMs) {
              totalMs += event.latencyMs;
            }
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
      finalContent = err instanceof Error ? `Error: ${err.message}` : "An error occurred while processing your query.";
    }

    setIsStreaming(false);

    const completedSteps = [...liveSteps];

    // Extract search results from the search step to show as sources in the response
    const searchStep = completedSteps.find((s) => s.id === "search");
    const rawResults = searchStep?.data?.results as Array<{ id: string; similarity: number; preview: Record<string, string | number> }> | undefined;
    const searchCollection = String(searchStep?.data?.collection ?? "documents");
    const sources = rawResults?.map((r) => ({
      collection: searchCollection,
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
    <div
      className="flex flex-col flex-1 min-w-0"
      style={{ backgroundColor: "#0b0f1a" }}
    >
      {/* Top bar: conversation selector */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: "#1e2d4a", backgroundColor: "#0d1220" }}
      >
        {/* Active conversation name */}
        <div className="flex items-center gap-2 px-2 py-1.5">
          <MessageSquare size={14} style={{ color: "#00c2cb" }} />
          <span className="text-sm font-medium truncate max-w-[200px]" style={{ color: "#f8fafc" }}>
            {activeConv?.name ?? "Conversation"}
          </span>
        </div>

      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {isEmpty ? (
          <EmptyState
            onHintClick={(hint) => { setInput(hint); inputRef.current?.focus(); }}
            isConnected={!!astraToken}
            initializing={initializing}
            fields={activeCollection && collectionFields?.[activeCollection] ? collectionFields[activeCollection] : []}
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
                      style={{ background: "linear-gradient(135deg, #6c63ff, #00c2cb)", color: "#f8fafc" }}
                    >
                      AI
                    </div>
                    <div
                      className="text-[8px] font-bold px-1 rounded"
                      style={{ backgroundColor: "rgba(15,98,254,0.15)", color: "#4589ff", fontFamily: "monospace", lineHeight: "1.4" }}
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
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="px-4 py-3 border-t shrink-0"
        style={{ borderColor: "#1e2d4a", backgroundColor: "#0d1220" }}
      >
        <div className="max-w-3xl mx-auto">
          <div
            className="flex flex-col rounded-xl overflow-hidden"
            style={{
              backgroundColor: "#13192b",
              border: "1px solid #1e2d4a",
            }}
            onFocus={() => {}}
          >
            {/* Text input */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your data..."
              rows={1}
              className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm outline-none placeholder:text-[#64748b]"
              style={{
                color: "#f8fafc",
                maxHeight: "120px",
                minHeight: "44px",
              }}
            />

            {/* Bottom bar */}
            <div className="flex flex-col gap-1.5 px-3 pb-2.5 pt-1">
              <div className="flex items-center justify-between">
              <SearchModeToggle
                value={searchMode}
                onChange={setSearchMode}
              />

              <motion.button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isStreaming}
                className="relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold overflow-hidden transition-opacity shrink-0"
                style={{
                  background:
                    input.trim() && !isStreaming
                      ? "linear-gradient(135deg, #ff6b35, #ff8c5a)"
                      : "#1e2d4a",
                  color: input.trim() && !isStreaming ? "#f8fafc" : "#64748b",
                  boxShadow:
                    input.trim() && !isStreaming
                      ? "0 2px 12px rgba(255, 107, 53, 0.3)"
                      : "none",
                  cursor:
                    input.trim() && !isStreaming ? "pointer" : "not-allowed",
                }}
                whileHover={
                  input.trim() && !isStreaming ? { scale: 1.03 } : {}
                }
                whileTap={input.trim() && !isStreaming ? { scale: 0.96 } : {}}
              >
                {sendRipple && (
                  <motion.span
                    className="absolute inset-0 rounded-lg"
                    initial={{ scale: 0, opacity: 0.5 }}
                    animate={{ scale: 2.5, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    style={{ backgroundColor: "rgba(255, 107, 53, 0.4)" }}
                  />
                )}
                <Send size={12} />
                Send
              </motion.button>
              </div>

              {/* SDK code hint */}
              <div
                className="rounded-md overflow-hidden"
                style={{ backgroundColor: "rgba(11, 15, 26, 0.6)", border: "1px solid #1e2d4a" }}
              >
                {/* Language toggle */}
                <div className="flex items-center justify-between px-2 pt-1 pb-0.5">
                  <span className="text-[10px]" style={{ color: "#475569", fontFamily: "monospace" }}>
                    {{ ts: "astra-db-ts", python: "astrapy", java: "astra-db-java" }[codeLanguage]}
                  </span>
                  <div className="flex gap-0.5">
                    {(["ts", "python", "java"] as const).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setCodeLanguage(lang)}
                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide transition-colors"
                        style={{
                          backgroundColor: codeLanguage === lang ? "rgba(0,194,203,0.15)" : "transparent",
                          color: codeLanguage === lang ? "#00c2cb" : "#475569",
                          border: codeLanguage === lang ? "1px solid rgba(0,194,203,0.25)" : "1px solid transparent",
                        }}
                      >
                        {{ ts: "TS", python: "Py", java: "Java" }[lang]}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Code */}
                <div
                  className="flex items-center gap-1.5 px-2 pb-1 text-[11px] overflow-x-auto"
                  style={{ fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" }}
                >
                  {codeLanguage === "ts" && <>
                    {searchMode === "vector" && <>
                      <span style={{ color: "#00c2cb" }}>collection</span>
                      <span style={{ color: "#94a3b8" }}>.find(&#123;&#125;, &#123; sort: &#123; </span>
                      <span style={{ color: "#ff6b35" }}>$vector</span>
                      <span style={{ color: "#94a3b8" }}>: embed(query) &#125; &#125;)</span>
                    </>}
                    {searchMode === "hybrid" && <>
                      <span style={{ color: "#00c2cb" }}>collection</span>
                      <span style={{ color: "#94a3b8" }}>.findAndRerank(&#123;&#125;, &#123; sort: &#123; </span>
                      <span style={{ color: "#ff6b35" }}>$hybrid</span>
                      <span style={{ color: "#94a3b8" }}>: &#123; </span>
                      <span style={{ color: "#ff6b35" }}>$vectorize</span>
                      <span style={{ color: "#94a3b8" }}>: query &#125; &#125; &#125;)</span>
                    </>}
                    {searchMode === "lexical" && <>
                      <span style={{ color: "#00c2cb" }}>collection</span>
                      <span style={{ color: "#94a3b8" }}>.find(&#123; </span>
                      <span style={{ color: "#ff6b35" }}>$text</span>
                      <span style={{ color: "#94a3b8" }}>: &#123; </span>
                      <span style={{ color: "#ff6b35" }}>$search</span>
                      <span style={{ color: "#94a3b8" }}>: query &#125; &#125;)</span>
                    </>}
                  </>}
                  {codeLanguage === "python" && <>
                    {searchMode === "vector" && <>
                      <span style={{ color: "#00c2cb" }}>collection</span>
                      <span style={{ color: "#94a3b8" }}>.find(&#123;&#125;, sort=&#123;</span>
                      <span style={{ color: "#ff6b35" }}>&quot;$vector&quot;</span>
                      <span style={{ color: "#94a3b8" }}>: embed(query)&#125;)</span>
                    </>}
                    {searchMode === "hybrid" && <>
                      <span style={{ color: "#00c2cb" }}>collection</span>
                      <span style={{ color: "#94a3b8" }}>.find_and_rerank(&#123;&#125;, sort=&#123;</span>
                      <span style={{ color: "#ff6b35" }}>&quot;$hybrid&quot;</span>
                      <span style={{ color: "#94a3b8" }}>: &#123;</span>
                      <span style={{ color: "#ff6b35" }}>&quot;$vectorize&quot;</span>
                      <span style={{ color: "#94a3b8" }}>: query&#125;&#125;)</span>
                    </>}
                    {searchMode === "lexical" && <>
                      <span style={{ color: "#00c2cb" }}>collection</span>
                      <span style={{ color: "#94a3b8" }}>.find(&#123;</span>
                      <span style={{ color: "#ff6b35" }}>&quot;$text&quot;</span>
                      <span style={{ color: "#94a3b8" }}>: &#123;</span>
                      <span style={{ color: "#ff6b35" }}>&quot;$search&quot;</span>
                      <span style={{ color: "#94a3b8" }}>: query&#125;&#125;)</span>
                    </>}
                  </>}
                  {codeLanguage === "java" && <>
                    {searchMode === "vector" && <>
                      <span style={{ color: "#00c2cb" }}>collection</span>
                      <span style={{ color: "#94a3b8" }}>.find(Filter.empty(), new FindOptions().sort(</span>
                      <span style={{ color: "#ff6b35" }}>Sorts.vector</span>
                      <span style={{ color: "#94a3b8" }}>(embedding)))</span>
                    </>}
                    {searchMode === "hybrid" && <>
                      <span style={{ color: "#00c2cb" }}>collection</span>
                      <span style={{ color: "#94a3b8" }}>.findAndRerank(Filter.empty(), new FindOneAndRerankOptions().sort(</span>
                      <span style={{ color: "#ff6b35" }}>Sorts.hybrid</span>
                      <span style={{ color: "#94a3b8" }}>(query)))</span>
                    </>}
                    {searchMode === "lexical" && <>
                      <span style={{ color: "#00c2cb" }}>collection</span>
                      <span style={{ color: "#94a3b8" }}>.find(</span>
                      <span style={{ color: "#ff6b35" }}>Filter.text</span>
                      <span style={{ color: "#94a3b8" }}>(query))</span>
                    </>}
                  </>}
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] mt-2 text-center" style={{ color: "#64748b" }}>
            Press{" "}
            <kbd
              className="px-1 py-0.5 rounded text-[10px]"
              style={{
                backgroundColor: "#1e2d4a",
                border: "1px solid #2a3d5e",
                color: "#94a3b8",
              }}
            >
              Enter
            </kbd>{" "}
            to send ·{" "}
            <kbd
              className="px-1 py-0.5 rounded text-[10px]"
              style={{
                backgroundColor: "#1e2d4a",
                border: "1px solid #2a3d5e",
                color: "#94a3b8",
              }}
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

function EmptyState({ onHintClick, isConnected, initializing, fields = [], activeCollection }: { onHintClick: (hint: string) => void; isConnected: boolean; initializing?: boolean; fields?: string[]; activeCollection?: string }) {
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
          style={{ color: "#475569" }}
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
            boxShadow: "0 0 20px rgba(251,191,36,0.08)",
          }}
        >
          <span className="text-base">⚠</span>
          <span>Demo mode — connect to Astra DB to query real data</span>
        </motion.div>
      ) : null}
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-1" style={{ color: "#f8fafc" }}>
          Ask anything about your data
        </h3>
        <p className="text-sm" style={{ color: "#64748b" }}>
          Use vector, hybrid, or lexical search to explore your collections
        </p>
      </div>

      {fields.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="w-full max-w-md rounded-xl px-4 py-3.5"
          style={{ backgroundColor: "rgba(0,194,203,0.04)", border: "1px solid rgba(0,194,203,0.12)" }}
        >
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-2.5" style={{ color: "#334155" }}>
            {activeCollection ? `Fields in ${activeCollection}` : "Available fields"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {fields.map((f) => (
              <button
                key={f}
                onClick={() => onHintClick(f)}
                className="px-2.5 py-1 rounded-lg text-xs font-mono transition-all"
                style={{ backgroundColor: "rgba(30,45,74,0.5)", color: "#64748b", border: "1px solid #1e2d4a" }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.color = "#00c2cb";
                  el.style.borderColor = "rgba(0,194,203,0.35)";
                  el.style.backgroundColor = "rgba(0,194,203,0.07)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.color = "#64748b";
                  el.style.borderColor = "#1e2d4a";
                  el.style.backgroundColor = "rgba(30,45,74,0.5)";
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </motion.div>
      )}

    </motion.div>
  );
}
