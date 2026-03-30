"use client";

import { useCallback, useEffect, useState } from "react";
import type { Collection } from "@/lib/types";
import { fetchCollectionsFromApi } from "@/lib/playground/client";

interface UsePlaygroundConnectionArgs {
  bootstrapConversations: () => Promise<string>;
  resetConversationTracking: () => void;
  onDisconnectViewReset?: () => void;
}

export function usePlaygroundConnection({
  bootstrapConversations,
  resetConversationTracking,
  onDisconnectViewReset,
}: UsePlaygroundConnectionArgs) {
  const [astraToken, setAstraToken] = useState("");
  const [astraEndpoint, setAstraEndpoint] = useState("");
  const [astraFromEnv, setAstraFromEnv] = useState(false);
  const [envReady, setEnvReady] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [theme, setThemeState] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("theme") as "dark" | "light" | null) ?? "dark";
  });
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionFields, setCollectionFields] = useState<Record<string, string[]>>({});
  const [activeCollection, setActiveCollection] = useState("");
  const [keyspaces, setKeyspaces] = useState<string[]>([]);
  const [selectedKeyspace, setSelectedKeyspace] = useState("default_keyspace");

  const applyTheme = (t: "dark" | "light") => {
    const html = document.documentElement;
    if (t === "dark") html.classList.add("dark");
    else html.classList.remove("dark");
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    applyTheme(next);
    localStorage.setItem("theme", next);
  };

  const applyConnectionResult = (
    result: Awaited<ReturnType<typeof fetchCollectionsFromApi>>,
    fromEnv: boolean
  ) => {
    setAstraToken(result.token);
    setAstraEndpoint(result.endpoint);
    setAstraFromEnv(fromEnv);
    setCollections(result.collections);
    setCollectionFields(result.fields);
    const firstUserCollection = result.collections.find((c) => !c.name.startsWith("dap_"))?.name ?? result.collections[0]?.name ?? "";
    setActiveCollection(firstUserCollection);
    setKeyspaces(result.keyspaces);
    if (result.keyspaces.length > 0) setSelectedKeyspace(result.keyspaces[0]);
  };

  const fetchCollections = useCallback(async (token: string, endpoint: string, keyspace?: string) => {
    const result = await fetchCollectionsFromApi(token, endpoint, keyspace);
    setCollections(result.collections);
    setCollectionFields(result.fields);
    setActiveCollection(result.collections.find((c) => !c.name.startsWith("dap_"))?.name ?? result.collections[0]?.name ?? "");
    return result;
  }, []);

  useEffect(() => {
    applyTheme(theme);

    const token = sessionStorage.getItem("astra_token") ?? "";
    const endpoint = sessionStorage.getItem("astra_endpoint") ?? "";

    const restorePromise = (async () => {
      await bootstrapConversations();

      if (token && endpoint) {
        await fetchCollectionsFromApi(token, endpoint)
          .then((result) => applyConnectionResult(result, false))
          .catch(() => {});
        return;
      }

      try {
        const status = await fetch("/api/astra-status").then((r) => r.json() as Promise<{ hasToken: boolean; hasEndpoint: boolean }>);
        setEnvReady(status.hasToken && status.hasEndpoint);
        if (status.hasToken && status.hasEndpoint) {
          await fetchCollectionsFromApi("", "")
            .then((result) => applyConnectionResult(result, true))
            .catch(() => {});
        }
      } catch { /* ignore */ }
    })();

    void restorePromise.finally(() => setInitializing(false));
  }, [bootstrapConversations, theme]);

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
      resetConversationTracking();
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
    setCollectionFields({});
    setActiveCollection("");
    setKeyspaces([]);
    setSelectedKeyspace("default_keyspace");
    sessionStorage.removeItem("astra_token");
    sessionStorage.removeItem("astra_endpoint");
    resetConversationTracking();
    onDisconnectViewReset?.();
    void bootstrapConversations();
  };

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

  const isConnected = !!astraToken;
  const activeCollectionObj = collections.find((c) => c.name === activeCollection) ?? collections[0];

  return {
    astraToken,
    astraEndpoint,
    astraFromEnv,
    envReady,
    initializing,
    isConnected,
    connectDialogOpen,
    setConnectDialogOpen,
    connectError,
    setConnectError,
    handleConnect,
    handleDisconnect,
    theme,
    toggleTheme,
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
  };
}
