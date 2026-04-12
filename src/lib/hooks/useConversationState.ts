"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { Conversation, Message } from "@/lib/types";
import {
  createConversationInApi,
  fetchConversationsFromApi,
  getNextUntitledConversationName,
  isUntitledConversationName,
  makeBlankConversation,
  serializeMessage,
  UNTITLED_CONVERSATION_NAME,
} from "@/lib/playground/client";

const messageResponseSchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    timestamp: z.string(),
    searchMode: z.string().optional(),
    latencyMs: z.number().optional(),
    pipelineSteps: z.array(z.object({
      id: z.string(),
      status: z.string(),
      latencyMs: z.number().optional(),
      data: z.record(z.string(), z.unknown()).optional(),
    })).optional(),
    sources: z.array(z.object({
      collection: z.string(),
      id: z.string(),
      similarity: z.number(),
      preview: z.record(z.string(), z.union([z.string(), z.number()])),
    })).optional(),
  })).default([]),
});

interface UseConversationStateArgs {
  huggingfaceApiKey: string;
  onConversationActivated?: () => void;
}

export function useConversationState({
  huggingfaceApiKey,
  onConversationActivated,
}: UseConversationStateArgs) {
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([makeBlankConversation()]);
  const [activeConversationId, setActiveConversationId] = useState(conversations[0]?.id ?? "");

  const persistedMessageIds = useRef(new Set<string>());
  const loadedConvIds = useRef(new Set<string>());
  const activeConvIdRef = useRef(activeConversationId);
  const conversationsRef = useRef(conversations);

  useEffect(() => { activeConvIdRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  const resetConversationTracking = useCallback(() => {
    persistedMessageIds.current = new Set();
    loadedConvIds.current = new Set();
  }, []);

  const loadConversationMessages = useCallback(async (convId: string) => {
    if (loadedConvIds.current.has(convId)) return;
    loadedConvIds.current.add(convId);
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`);
      if (!res.ok) {
        loadedConvIds.current.delete(convId);
        return;
      }
      const data = messageResponseSchema.parse(await res.json());
      const messages: Message[] = data.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        searchMode: m.searchMode as Message["searchMode"],
        latencyMs: m.latencyMs,
        pipelineSteps: m.pipelineSteps as Message["pipelineSteps"],
        sources: m.sources,
      }));
      messages.forEach((m) => persistedMessageIds.current.add(m.id));
      setConversations((prev) =>
        prev.map((c) => c.id === convId ? { ...c, messages, messageCount: messages.length } : c)
      );
    } catch {
      loadedConvIds.current.delete(convId);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId ? { ...c, loadError: "Failed to load messages" } : c
        )
      );
    }
  }, []);

  const bootstrapConversations = useCallback(async (): Promise<string> => {
    const convs = await fetchConversationsFromApi();
    if (convs.length > 0) {
      setConversations(convs);
      setActiveConversationId(convs[0].id);
      await loadConversationMessages(convs[0].id);
      return convs[0].id;
    }

    const newConv = await createConversationInApi(UNTITLED_CONVERSATION_NAME);
    loadedConvIds.current.add(newConv.id);
    setConversations([newConv]);
    setActiveConversationId(newConv.id);
    return newConv.id;
  }, [loadConversationMessages]);

  const handleConversationChange = useCallback(async (id: string) => {
    setActiveConversationId(id);
    onConversationActivated?.();
    await loadConversationMessages(id);
  }, [loadConversationMessages, onConversationActivated]);

  const handleNewConversation = useCallback(async () => {
    if (creatingConversation) return;
    const name = getNextUntitledConversationName(conversations);

    setCreatingConversation(true);
    try {
      const newConv = await createConversationInApi(name);
      loadedConvIds.current.add(newConv.id);
      setConversations((prev) => [{ ...newConv, name }, ...prev]);
      setActiveConversationId(newConv.id);
      onConversationActivated?.();
    } finally {
      setCreatingConversation(false);
    }
  }, [conversations, creatingConversation, onConversationActivated]);

  const handleRenameConversation = useCallback(async (id: string, name: string) => {
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, name } : c));
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => {
      // Best-effort server sync — local rename already applied above.
    });
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    const isActive = id === activeConvIdRef.current;

    setConversations((prev) => prev.filter((c) => c.id !== id));

    if (isActive) {
      const remaining = conversationsRef.current.filter((c) => c.id !== id);
      const next = remaining[0];
      if (next) {
        setActiveConversationId(next.id);
        void loadConversationMessages(next.id);
      } else {
        const name = getNextUntitledConversationName(remaining);
        try {
          const newConv = await createConversationInApi(name);
          loadedConvIds.current.add(newConv.id);
          setConversations([newConv]);
          setActiveConversationId(newConv.id);
        } catch {
          setConversations([makeBlankConversation()]);
          setActiveConversationId("");
        }
      }
    }

    void fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {
      // Best-effort server deletion — local removal already applied above.
    });
  }, [loadConversationMessages]);

  const handleMessagesUpdate = useCallback((updated: Message[]) => {
    const convId = activeConvIdRef.current;
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, messages: updated, messageCount: updated.length, updatedAt: new Date() } : c)
    );

    const unpersisted = updated.filter((m) => !persistedMessageIds.current.has(m.id));
    for (const msg of unpersisted) {
      persistedMessageIds.current.add(msg.id);
      void fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: serializeMessage(msg) }),
      }).catch(() => {
        persistedMessageIds.current.delete(msg.id);
      });
    }

    const conv = conversationsRef.current.find((c) => c.id === convId);
    const firstUserMsg = updated.find((m) => m.role === "user");
    if (conv?.name && isUntitledConversationName(conv.name) && firstUserMsg && updated.filter((m) => m.role === "user").length === 1) {
      void fetch("/api/conversations/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstMessage: firstUserMsg.content,
          huggingfaceApiKey,
        }),
      })
        .then((r) => r.json() as Promise<{ title: string | null }>)
        .then(({ title }) => {
          if (title) {
            setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, name: title } : c));
            void fetch(`/api/conversations/${convId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: title }),
            });
          }
        })
        .catch(() => { /* silently ignore */ });
    }
  }, [huggingfaceApiKey]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages ?? [];

  return {
    conversations,
    activeConversationId,
    creatingConversation,
    messages,
    bootstrapConversations,
    resetConversationTracking,
    handleConversationChange,
    handleMessagesUpdate,
    handleNewConversation,
    handleRenameConversation,
    handleDeleteConversation,
  };
}
