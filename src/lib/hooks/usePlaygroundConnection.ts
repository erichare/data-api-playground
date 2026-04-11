"use client";

import { useCallback, useEffect, useState } from "react";
import type { Collection } from "@/lib/types";
import { fetchCollectionsFromApi } from "@/lib/playground/client";

interface UsePlaygroundConnectionArgs {
  bootstrapConversations: () => Promise<string>;
  resetConversationTracking: () => void;
  onDisconnectViewReset?: () => void;
  initialAstraEndpoint?: string;
}

export function usePlaygroundConnection({
  bootstrapConversations,
  resetConversationTracking,
  onDisconnectViewReset,
  initialAstraEndpoint = "",
}: UsePlaygroundConnectionArgs) {
  const [astraToken, setAstraToken] = useState("");
  const [astraEndpoint, setAstraEndpoint] = useState(initialAstraEndpoint);
  const [astraFromEnv, setAstraFromEnv] = useState(false);
  const [envReady, setEnvReady] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionFields, setCollectionFields] = useState<Record<string, string[]>>({});
  const [activeCollection, setActiveCollection] = useState("");
  const [keyspaces, setKeyspaces] = useState<string[]>([]);
  const [selectedKeyspace, setSelectedKeyspace] = useState("default_keyspace");

  const applyConnectionResult = (
    result: Awaited<ReturnType<typeof fetchCollectionsFromApi>>,
    fromEnv: boolean,
    token: string,
    endpoint: string
  ) => {
    setAstraToken(fromEnv ? "" : token);
    setAstraEndpoint(fromEnv ? "" : endpoint.replace(/\/$/, ""));
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
    const restorePromise = (async () => {
      await bootstrapConversations();

      try {
        const status = await fetch("/api/astra-status").then((r) => r.json() as Promise<{ hasToken: boolean; hasEndpoint: boolean }>);
        setEnvReady(status.hasToken && status.hasEndpoint);
        if (status.hasToken && status.hasEndpoint) {
          await fetchCollectionsFromApi("", "")
            .then((result) => applyConnectionResult(result, true, "", ""))
            .catch(() => {});
        }
      } catch { /* ignore */ }
    })();

    void restorePromise.finally(() => setInitializing(false));
  }, [bootstrapConversations]);

  const handleConnect = async (token: string, endpoint: string) => {
    setConnectError("");
    const fromEnv = !token && !endpoint;
    try {
      const result = await fetchCollections(token, endpoint);
      setAstraToken(fromEnv ? "" : token);
      setAstraEndpoint(fromEnv ? "" : endpoint.replace(/\/$/, ""));
      setAstraFromEnv(fromEnv);
      setKeyspaces(result.keyspaces);
      if (result.keyspaces.length > 0) setSelectedKeyspace(result.keyspaces[0]);
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
    resetConversationTracking();
    onDisconnectViewReset?.();
    void bootstrapConversations();
  };

  const handleSelectCollection = (name: string) => {
    setActiveCollection(name);
  };

  const handleKeyspaceChange = async (keyspace: string) => {
    setSelectedKeyspace(keyspace);
    if (!astraFromEnv && (!astraToken || !astraEndpoint)) return;
    try {
      await fetchCollections(
        astraFromEnv ? "" : astraToken,
        astraFromEnv ? "" : astraEndpoint,
        keyspace
      );
    } catch { /* ignore */ }
  };

  const handleCollectionCreated = (collection: Collection) => {
    setCollections((prev) => [...prev, collection]);
    setActiveCollection(collection.name);
  };

  const isConnected = astraFromEnv || !!astraToken;
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
