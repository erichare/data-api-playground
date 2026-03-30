"use client";

import { useState, useEffect, useRef } from "react";
import type { Message, Conversation, ViewMode, Collection } from "@/lib/types";

// ── Astra DB API helpers ────────────────────────────────────────────────────

async function fetchCollectionsFromApi(
  token: string,
  endpoint: string,
  keyspace?: string
): Promise<{ collections: Collection[]; fields: Record<string, string[]>; token: string; endpoint: string; keyspaces: string[] }> {
  const [connectRes, ksRes] = await Promise.all([
    fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, endpoint, keyspace }),
    }),
    fetch("/api/keyspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, endpoint }),
    }),
  ]);

  const data = await connectRes.json() as {
    collections?: Collection[];
    fields?: Record<string, string[]>;
    error?: string;
    token?: string;
    endpoint?: string;
  };
  if (!connectRes.ok || data.error) throw new Error(data.error ?? "Connection failed");

  const ksData = await ksRes.json() as { keyspaces?: string[]; error?: string };

  return {
    collections: data.collections!,
    fields: data.fields ?? {},
    token: data.token ?? token,
    endpoint: data.endpoint ?? endpoint,
    keyspaces: ksData.keyspaces ?? [],
  };
}

interface RemoteConversation {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

const UNTITLED_CONVERSATION_NAME = "Untitled";
const UNTITLED_CONVERSATION_PATTERN = /^Untitled(?: \((\d+)\))?$/;

async function fetchConversationsFromApi(): Promise<Conversation[]> {
  const res = await fetch("/api/conversations");
  if (!res.ok) return [];
  const data = await res.json() as { conversations?: RemoteConversation[] };
  return (data.conversations ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    messages: [],
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    messageCount: c.messageCount,
  }));
}

async function createConversationInApi(name?: string): Promise<Conversation> {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json() as { conversation: RemoteConversation };
  const c = data.conversation;
  return {
    id: c.id,
    name: c.name,
    messages: [],
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    messageCount: 0,
  };
}

function serializeMessage(msg: Message): Record<string, unknown> {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : String(msg.timestamp),
    ...(msg.searchMode ? { searchMode: msg.searchMode } : {}),
    ...(msg.latencyMs != null ? { latencyMs: msg.latencyMs } : {}),
    ...(msg.pipelineSteps ? {
      pipelineSteps: msg.pipelineSteps.map((s) => ({
        id: s.id,
        status: s.status,
        latencyMs: s.latencyMs,
        ...(s.id !== "search" ? { data: s.data } : {
          data: {
            collection: (s.data as Record<string, unknown>)?.collection,
            command: (s.data as Record<string, unknown>)?.command,
            resultCount: ((s.data as Record<string, unknown>)?.results as unknown[])?.length ?? 0,
          },
        }),
      })),
    } : {}),
    ...(msg.sources ? { sources: msg.sources } : {}),
  };
}

// ── Initial state ───────────────────────────────────────────────────────────

function makeBlankConversation(): Conversation {
  const now = new Date();
  return {
    id: `conv-${Date.now()}`,
    name: UNTITLED_CONVERSATION_NAME,
    messages: [],
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function usePlaygroundState() {
  // Connection
  const [astraToken, setAstraToken] = useState("");
  const [astraEndpoint, setAstraEndpoint] = useState("");
  const [astraFromEnv, setAstraFromEnv] = useState(false);
  const [ibmApiKey, setIbmApiKey] = useState("");
  const [watsonxProjectId, setWatsonxProjectId] = useState("");
  const [envReady, setEnvReady] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectError, setConnectError] = useState("");

  // Theme — persisted to localStorage, defaulting to dark
  const [theme, setThemeState] = useState<"dark" | "light">("dark");

  // Collections / keyspaces
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionFields, setCollectionFields] = useState<Record<string, string[]>>({});
  const [activeCollection, setActiveCollection] = useState("");
  const [keyspaces, setKeyspaces] = useState<string[]>([]);
  const [selectedKeyspace, setSelectedKeyspace] = useState("default_keyspace");

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([makeBlankConversation()]);
  const [activeConversationId, setActiveConversationId] = useState(conversations[0]?.id ?? "");

  // Refs for persistence tracking
  const persistedMessageIds = useRef(new Set<string>());
  const loadedConvIds = useRef(new Set<string>());
  const astraTokenRef = useRef(astraToken);
  const astraEndpointRef = useRef(astraEndpoint);
  const activeConvIdRef = useRef(activeConversationId);

  useEffect(() => { astraTokenRef.current = astraToken; }, [astraToken]);
  useEffect(() => { astraEndpointRef.current = astraEndpoint; }, [astraEndpoint]);
  useEffect(() => { activeConvIdRef.current = activeConversationId; }, [activeConversationId]);

  // ── Theme management ──────────────────────────────────────────────────────

  const applyTheme = (t: "dark" | "light") => {
    const html = document.documentElement;
    if (t === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    applyTheme(next);
    localStorage.setItem("theme", next);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getNextUntitledConversationName = (existing: Conversation[]) => {
    const usedIndices = new Set<number>();
    for (const conversation of existing) {
      const match = conversation.name.match(UNTITLED_CONVERSATION_PATTERN);
      if (!match) continue;
      usedIndices.add(match[1] ? Number(match[1]) : 0);
    }

    let nextIndex = 0;
    while (usedIndices.has(nextIndex)) nextIndex += 1;
    return nextIndex === 0 ? UNTITLED_CONVERSATION_NAME : `${UNTITLED_CONVERSATION_NAME} (${nextIndex})`;
  };

  const isUntitledConversationName = (name: string) => UNTITLED_CONVERSATION_PATTERN.test(name);

  const loadConversationMessages = async (convId: string) => {
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
  };

  const bootstrapConversations = async (): Promise<string> => {
    const convs = await fetchConversationsFromApi();
    if (convs.length > 0) {
      setConversations(convs);
      setActiveConversationId(convs[0].id);
      // Messages live in local SQLite — no Astra connection needed
      await loadConversationMessages(convs[0].id);
      return convs[0].id;
    } else {
      const newConv = await createConversationInApi(UNTITLED_CONVERSATION_NAME);
      loadedConvIds.current.add(newConv.id);
      setConversations([newConv]);
      setActiveConversationId(newConv.id);
      return newConv.id;
    }
  };

  // ── Mount: restore session ────────────────────────────────────────────────

  useEffect(() => {
    // Restore theme preference
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    if (savedTheme) {
      setThemeState(savedTheme);
      applyTheme(savedTheme);
    } else {
      applyTheme("dark"); // default to dark
    }

    const token = sessionStorage.getItem("astra_token") ?? "";
    const endpoint = sessionStorage.getItem("astra_endpoint") ?? "";
    const ibmKey = sessionStorage.getItem("ibm_api_key") ?? "";
    const wxProjectId = sessionStorage.getItem("watsonx_project_id") ?? "";
    setIbmApiKey(ibmKey);
    setWatsonxProjectId(wxProjectId);

    const applyConnectionResult = (r: Awaited<ReturnType<typeof fetchCollectionsFromApi>>, fromEnv: boolean) => {
      setAstraToken(r.token);
      setAstraEndpoint(r.endpoint);
      setAstraFromEnv(fromEnv);
      setCollections(r.collections);
      setCollectionFields(r.fields);
      const firstUserCollection = r.collections.find((c) => !c.name.startsWith("dap_"))?.name ?? r.collections[0]?.name ?? "";
      setActiveCollection(firstUserCollection);
      setKeyspaces(r.keyspaces);
      if (r.keyspaces.length > 0) setSelectedKeyspace(r.keyspaces[0]);
    };

    const restorePromise = (async () => {
      // Always load conversations + messages from local SQLite first
      await bootstrapConversations();

      if (token && endpoint) {
        await fetchCollectionsFromApi(token, endpoint)
          .then((r) => applyConnectionResult(r, false))
          .catch(() => {});
        return;
      }
      try {
        const status = await fetch("/api/astra-status").then((r) => r.json() as Promise<{ hasToken: boolean; hasEndpoint: boolean }>);
        setEnvReady(status.hasToken && status.hasEndpoint);
        if (status.hasToken && status.hasEndpoint) {
          await fetchCollectionsFromApi("", "")
            .then((r) => applyConnectionResult(r, true))
            .catch(() => {});
        }
      } catch { /* ignore */ }
    })();

    void restorePromise.finally(() => setInitializing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Collections ───────────────────────────────────────────────────────────

  const fetchCollections = async (token: string, endpoint: string, keyspace?: string) => {
    const result = await fetchCollectionsFromApi(token, endpoint, keyspace);
    setCollections(result.collections);
    setCollectionFields(result.fields);
    setActiveCollection(result.collections.find((c) => !c.name.startsWith("dap_"))?.name ?? result.collections[0]?.name ?? "");
    return result;
  };

  // ── Connection ────────────────────────────────────────────────────────────

  const handleConnect = async (token: string, endpoint: string) => {
    setConnectError("");
    const fromEnv = !token && !endpoint;
    try {
      const result = await fetchCollections(token, endpoint);
      setAstraToken(result.token);
      setAstraEndpoint(result.endpoint);
      setAstraFromEnv(fromEnv);
      setKeyspaces(result.keyspaces);
      if (result.keyspaces.length > 0) setSelectedKeyspace(result.keyspaces[0]);
      if (!fromEnv) {
        sessionStorage.setItem("astra_token", result.token);
        sessionStorage.setItem("astra_endpoint", result.endpoint);
      }
      persistedMessageIds.current = new Set();
      loadedConvIds.current = new Set();
      await bootstrapConversations();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connection failed");
      throw err;
    }
  };

  const handleDisconnect = () => {
    setAstraToken("");
    setAstraEndpoint("");
    setAstraFromEnv(false);
    setCollections([]);
    setActiveCollection("");
    setKeyspaces([]);
    setSelectedKeyspace("default_keyspace");
    setViewMode("chat");
    sessionStorage.removeItem("astra_token");
    sessionStorage.removeItem("astra_endpoint");
    persistedMessageIds.current = new Set();
    loadedConvIds.current = new Set();
    // Re-bootstrap from DB so conversations are always persisted
    void bootstrapConversations();
  };

  // ── Conversation management ───────────────────────────────────────────────

  const handleConversationChange = async (id: string) => {
    setActiveConversationId(id);
    setViewMode("chat");
    await loadConversationMessages(id);
  };

  const handleNewConversation = async () => {
    if (creatingConversation) return;
    const name = getNextUntitledConversationName(conversations);

    setCreatingConversation(true);
    try {
      const newConv = await createConversationInApi(name);
      loadedConvIds.current.add(newConv.id);
      setConversations((prev) => [{ ...newConv, name }, ...prev]);
      setActiveConversationId(newConv.id);
    } finally {
      setCreatingConversation(false);
    }
  };

  const handleRenameConversation = async (id: string, name: string) => {
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, name } : c));
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(console.error);
  };

  const handleDeleteConversation = async (id: string) => {
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (id === activeConvIdRef.current) {
        const next = remaining[0];
        if (next) {
          setActiveConversationId(next.id);
          void loadConversationMessages(next.id);
        } else {
          // All deleted — create a new persisted conversation
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
  };

  // ── Messages ──────────────────────────────────────────────────────────────

  const handleMessagesUpdate = (updated: Message[]) => {
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

    // Auto-title: fire once when the first user message arrives and name is still an untitled placeholder
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
  };

  // ── Other handlers ────────────────────────────────────────────────────────

  const handleSelectCollection = (name: string) => {
    setActiveCollection(name);
  };

  const handleKeyspaceChange = async (keyspace: string) => {
    setSelectedKeyspace(keyspace);
    if (!astraToken || !astraEndpoint) return;
    try {
      await fetchCollections(astraToken, astraEndpoint, keyspace);
    } catch { /* ignore */ }
  };

  const handleCollectionCreated = (collection: Collection) => {
    setCollections((prev) => [...prev, collection]);
    setActiveCollection(collection.name);
  };

  const handleIbmApiKeyChange = (key: string) => {
    setIbmApiKey(key);
    if (key) sessionStorage.setItem("ibm_api_key", key);
    else sessionStorage.removeItem("ibm_api_key");
  };

  const handleWatsonxProjectIdChange = (id: string) => {
    setWatsonxProjectId(id);
    if (id) sessionStorage.setItem("watsonx_project_id", id);
    else sessionStorage.removeItem("watsonx_project_id");
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const isConnected = !!astraToken;
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages ?? [];
  const activeCollectionObj = collections.find((c) => c.name === activeCollection) ?? collections[0];

  return {
    // Connection
    astraToken,
    astraEndpoint,
    astraFromEnv,
    ibmApiKey,
    watsonxProjectId,
    handleIbmApiKeyChange,
    handleWatsonxProjectIdChange,
    envReady,
    initializing,
    isConnected,
    connectDialogOpen,
    setConnectDialogOpen,
    connectError,
    setConnectError,
    handleConnect,
    handleDisconnect,

    // Theme
    theme,
    toggleTheme,

    // Collections / keyspaces
    collections,
    setCollections,
    collectionFields,
    activeCollection,
    activeCollectionObj,
    keyspaces,
    selectedKeyspace,
    handleSelectCollection,
    handleKeyspaceChange,
    handleCollectionCreated,

    // UI
    viewMode,
    setViewMode,
    newCollectionOpen,
    setNewCollectionOpen,
    quickStartOpen,
    setQuickStartOpen,

    // Conversations
    conversations,
    activeConversationId,
    handleConversationChange,
    messages,
    handleMessagesUpdate,
    handleNewConversation,
    creatingConversation,
    handleRenameConversation,
    handleDeleteConversation,
  };
}
