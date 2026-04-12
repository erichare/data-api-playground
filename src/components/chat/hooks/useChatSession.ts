"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Message,
  PipelineStep,
  PipelineStepId,
  SearchMode,
} from "@/lib/types";
import { readNdjsonStream } from "@/lib/ndjson";

interface ChatCollectionInput {
  name: string;
  isVectorize: boolean;
  vectorDimension?: number | null;
}

interface UseChatSessionArgs {
  messages: Message[];
  onMessagesUpdate: (messages: Message[]) => void;
  astraToken?: string;
  astraEndpoint?: string;
  keyspace?: string;
  collections?: ChatCollectionInput[];
  activeCollection?: string;
  huggingfaceApiKey?: string;
  collectionFields?: Record<string, string[]>;
}

interface ChatStreamEvent {
  step?: PipelineStepId;
  status?: PipelineStep["status"];
  latencyMs?: number;
  data?: Record<string, unknown>;
  error?: string;
  requestId?: string;
}

interface SearchResultLike {
  id: string;
  similarity: number;
  preview: Record<string, string | number>;
  collection?: string;
}

function buildChatHistory(messages: Message[]) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content:
        message.role === "assistant" &&
        message.sources &&
        message.sources.length > 0
          ? `${message.content}\n\n[Search results shown to user:]\n${message.sources
              .map(
                (source, index) =>
                  `[${index + 1}] ${Object.entries(source.preview)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(" | ")}`
              )
              .join("\n")}`
          : message.content,
    }));
}

async function readChatStream(
  response: Response,
  onEvent: (event: ChatStreamEvent) => void
) {
  if (!response.body) {
    throw new Error("No response body");
  }

  await readNdjsonStream<ChatStreamEvent>(response.body, onEvent);
}

function getMessageSources(steps: PipelineStep[]) {
  const searchStep = steps.find((step) => step.id === "search");
  const rawResults = searchStep?.data?.results as SearchResultLike[] | undefined;
  const searchCollection = String(searchStep?.data?.collection ?? "documents");

  return rawResults?.map((result) => ({
    collection: result.collection ?? searchCollection,
    id: result.id,
    similarity: result.similarity,
    preview: result.preview,
  }));
}

function buildAssistantMessage(args: {
  steps: PipelineStep[];
  content: string;
  searchMode: SearchMode;
  latencyMs: number;
}): Message {
  const { steps, content, searchMode, latencyMs } = args;

  return {
    id: `msg-${crypto.randomUUID()}`,
    role: "assistant",
    content:
      content ||
      "I searched your collections and found relevant results based on your query.",
    searchMode,
    latencyMs: latencyMs || undefined,
    timestamp: new Date(),
    pipelineSteps: steps,
    sources: getMessageSources(steps),
  };
}

export function useChatSession({
  messages,
  onMessagesUpdate,
  astraToken,
  astraEndpoint,
  keyspace,
  collections,
  activeCollection,
  huggingfaceApiKey,
  collectionFields,
}: UseChatSessionArgs) {
  const [input, setInput] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [streamingSteps, setStreamingSteps] = useState<PipelineStep[]>([]);
  const [streamingResponseText, setStreamingResponseText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatError, setChatError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const canSend = input.trim().length > 0 && !isStreaming;

  const dismissChatError = useCallback(() => {
    setChatError("");
  }, []);

  const selectHint = useCallback((hint: string) => {
    setInput(hint);
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) {
      return;
    }

    const userMessage: Message = {
      id: `msg-${crypto.randomUUID()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    onMessagesUpdate(updatedMessages);
    setInput("");
    setIsStreaming(true);
    setStreamingSteps([]);
    setStreamingResponseText("");
    setChatError("");

    const liveSteps: PipelineStep[] = [];
    const upsertStep = (partial: Partial<PipelineStep> & { id: PipelineStepId }) => {
      const existingIndex = liveSteps.findIndex((step) => step.id === partial.id);

      if (existingIndex >= 0) {
        liveSteps[existingIndex] = { ...liveSteps[existingIndex], ...partial };
      } else {
        liveSteps.push({ status: "pending", ...partial } as PipelineStep);
      }

      setStreamingSteps([...liveSteps]);
    };

    let finalContent = "";
    let resolvedSearchMode = searchMode;
    let totalLatencyMs = 0;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
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
          history: buildChatHistory(messages),
        }),
      });

      await readChatStream(response, (event) => {
        if (event.error && !event.step) {
          const requestId = event.requestId ? ` (request ${event.requestId})` : "";
          throw new Error(`${event.error}${requestId}`);
        }

        if (!event.step || !event.status) {
          return;
        }

        upsertStep({
          id: event.step,
          status: event.status,
          latencyMs: event.latencyMs,
          data: event.data,
        });

        if (event.status === "complete" && event.latencyMs) {
          totalLatencyMs += event.latencyMs;
        }

        if (
          event.step === "analyze" &&
          event.status === "complete" &&
          event.data?.searchMode
        ) {
          resolvedSearchMode = String(event.data.searchMode) as SearchMode;
        }

        if (
          event.step === "respond" &&
          event.status === "running" &&
          typeof event.data?.content === "string"
        ) {
          finalContent = String(event.data.content);
          setStreamingResponseText(finalContent);
        }

        if (
          event.step === "respond" &&
          event.status === "complete" &&
          event.data?.content
        ) {
          finalContent = String(event.data.content);
          setStreamingResponseText(finalContent);
        }

        if (event.step === "respond" && event.status === "error") {
          finalContent = `Error: ${event.data?.error ?? "Failed to generate response"}`;
        }
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "An error occurred while processing your query.";
      setChatError(message);
      if (!finalContent.trim()) {
        finalContent = `Error: ${message}`;
      }
    } finally {
      setIsStreaming(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }

    const completedSteps = [...liveSteps];
    onMessagesUpdate([
      ...updatedMessages,
      buildAssistantMessage({
        steps: completedSteps,
        content: finalContent,
        searchMode: resolvedSearchMode,
        latencyMs: totalLatencyMs,
      }),
    ]);
    setStreamingSteps([]);
    setStreamingResponseText("");
  }, [
    activeCollection,
    astraEndpoint,
    astraToken,
    collectionFields,
    collections,
    huggingfaceApiKey,
    input,
    isStreaming,
    keyspace,
    messages,
    onMessagesUpdate,
    searchMode,
  ]);

  return {
    input,
    setInput,
    searchMode,
    setSearchMode,
    streamingSteps,
    streamingResponseText,
    isStreaming,
    chatError,
    dismissChatError,
    selectHint,
    canSend,
    sendMessage,
  };
}
