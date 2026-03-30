"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

interface UseConversationStateArgs {
  ibmApiKey: string;
  watsonxProjectId: string;
  onConversationActivated?: () => void;
}

export function useConversationState({
  ibmApiKey,
  watsonxProjectId,
  onConversationActivated,
}: UseConversationStateArgs) {
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([makeBlankConversation()]);
  const [activeConversationId, setActiveConversationId] = useState(conversations[0]?.id ?? "");

  const persistedMessageIds = useRef(new Set<string>());
  const loadedConvIds = useRef(new Set<string>());
  const activeConvIdRef = useRef(activeConversationId);

  useEffect(() => { activeConvIdRef.current = activeConversationId; }, [activeConversationId]);

  const resetConversationTracking = useCallback(() => {
    persistedMessageIds.current = new Set();
    loadedConvIds.current = new Set();
  }, []);

  const loadConversationMessages = useCallback(async (convId: string) => {
    if (loadedConvIds.current.has(convId)) return;
    loadedConvIds.current.add(convId);
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`);
      if (!res.ok) return;
      const data = await res.json() as { messages: Record<string, unknown>[] };
      const messages: Message[] = (data.messages ?? []).map((m) => ({
        id: m.id as string,
        role: m.role as "user" | "assistant",
        content: m.content as string,
        timestamp: new Date(m.timestamp as string),
        searchMode: m.searchMode as Message["searchMode"],
        latencyMs: m.latencyMs as number | undefined,
        pipelineSteps: m.pipelineSteps as Message["pipelineSteps"],
        sources: m.sources as Message["sources"],
      }));
      messages.forEach((m) => persistedMessageIds.current.add(m.id));
      setConversations((prev) =>
        prev.map((c) => c.id === convId ? { ...c, messages, messageCount: messages.length } : c)
      );
    } catch {
      loadedConvIds.current.delete(convId);
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
    }).catch(console.error);
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (id === activeConvIdRef.current) {
        const next = remaining[0];
        if (next) {
          setActiveConversationId(next.id);
          void loadConversationMessages(next.id);
        } else {
          const name = getNextUntitledConversationName(remaining);
          void createConversationInApi(name).then((newConv) => {
            loadedConvIds.current.add(newConv.id);
            setConversations([newConv]);
            setActiveConversationId(newConv.id);
          });
          return [];
        }
      }
      return remaining;
    });
    await fetch(`/api/conversations/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(console.error);
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

    const conv = conversations.find((c) => c.id === convId);
    const firstUserMsg = updated.find((m) => m.role === "user");
    if (conv?.name && isUntitledConversationName(conv.name) && firstUserMsg && updated.filter((m) => m.role === "user").length === 1) {
      void fetch("/api/conversations/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstMessage: firstUserMsg.content,
          ibmApiKey,
          watsonxProjectId,
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
  }, [conversations, ibmApiKey, watsonxProjectId]);

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
