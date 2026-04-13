"use client";

import { useCallback, useEffect, useState } from "react";
import type { Collection } from "@/lib/types";
import { fetchCollectionsFromApi } from "@/lib/playground/client";
import { useCollectionLifecycle } from "@/lib/hooks/useCollectionLifecycle";

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
  const [collectionCreateError, setCollectionCreateError] = useState("");
  const [keyspaces, setKeyspaces] = useState<string[]>([]);
  const [selectedKeyspace, setSelectedKeyspace] = useState("default_keyspace");

  // ── Collection lifecycle (create / delete / stats) ─────────────────
  const collectionLifecycle = useCollectionLifecycle({
    collections,
    setCollections,
    setCollectionFields,
    setActiveCollection,
    astraToken,
    astraEndpoint,
    astraFromEnv,
    selectedKeyspace,
  });

  const handleCollectionCreateFailed = useCallback(
    (name: string, message: string) => {
      collectionLifecycle.handleCollectionCreateFailed(name, message);
      setCollectionCreateError(message);
    },
    [collectionLifecycle]
  );

  const clearCollectionCreateError = useCallback(() => {
    setCollectionCreateError("");
  }, []);

  // ── Connection helpers ─────────────────────────────────────────────
  const formatKeyspacesWarning = useCallback(
    (message: string, source: "manual" | "env" = "manual") =>
      source === "env"
        ? `Connected using environment credentials, but keyspaces could not be listed. ${message}`
        : `Connected, but keyspaces could not be listed. ${message}`,
    []
  );

  const applyConnectionResult = useCallback((
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
  }, []);

  const fetchCollections = useCallback(async (token: string, endpoint: string, keyspace?: string) => {
    const result = await fetchCollectionsFromApi(token, endpoint, keyspace);
    setCollections(result.collections);
    setCollectionFields(result.fields);
    setActiveCollection(result.collections.find((c) => !c.name.startsWith("dap_"))?.name ?? result.collections[0]?.name ?? "");
    return result;
  }, []);

  // ── Initialization ─────────────────────────────────────────────────
  useEffect(() => {
    const restorePromise = (async () => {
      await bootstrapConversations().catch(() => {
        // Keep the local placeholder conversation when persisted bootstrap fails.
      });

      try {
        const status = await fetch("/api/astra-status").then((r) => r.json() as Promise<{ hasToken: boolean; hasEndpoint: boolean }>);
        setEnvReady(status.hasToken && status.hasEndpoint);
        if (status.hasToken && status.hasEndpoint) {
          await fetchCollectionsFromApi("", "")
            .then((result) => {
              applyConnectionResult(result, true, "", "");
              if (result.keyspacesError) {
                setConnectError(formatKeyspacesWarning(result.keyspacesError, "env"));
              }
            })
            .catch(() => {
              // Env-based auto-connect failed; user can connect manually via dialog.
            });
        }
      } catch {
        // Astra status endpoint unreachable during init — non-critical.
      }
    })();

    void restorePromise.finally(() => setInitializing(false));
  }, [applyConnectionResult, bootstrapConversations, formatKeyspacesWarning]);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleConnect = useCallback(async (token: string, endpoint: string) => {
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
      await bootstrapConversations().catch(() => {
        // A conversation refresh failure should not block a successful Astra connect.
      });
      if (result.keyspacesError) {
        const warning = formatKeyspacesWarning(result.keyspacesError);
        setConnectError(warning);
        throw new Error(warning);
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connection failed");
      throw err;
    }
  }, [bootstrapConversations, formatKeyspacesWarning, fetchCollections, resetConversationTracking]);

  const handleDisconnect = () => {
    setAstraToken("");
    setAstraEndpoint("");
    setAstraFromEnv(false);
    setCollections([]);
    setCollectionFields({});
    setActiveCollection("");
    setCollectionCreateError("");
    setKeyspaces([]);
    setSelectedKeyspace("default_keyspace");
    resetConversationTracking();
    onDisconnectViewReset?.();
    void bootstrapConversations().catch(() => {
      // Best-effort conversation bootstrap after disconnect.
    });
  };

  const handleSelectCollection = (name: string) => {
    setActiveCollection(name);
  };

  const handleKeyspaceChange = useCallback(async (keyspace: string) => {
    if (!astraFromEnv && (!astraToken || !astraEndpoint)) {
      setSelectedKeyspace(keyspace);
      return;
    }
    try {
      const result = await fetchCollections(
        astraFromEnv ? "" : astraToken,
        astraFromEnv ? "" : astraEndpoint,
        keyspace
      );
      setKeyspaces(result.keyspaces);
      setSelectedKeyspace(keyspace);
      setConnectError(
        result.keyspacesError
          ? formatKeyspacesWarning(
              result.keyspacesError,
              astraFromEnv ? "env" : "manual"
            )
          : ""
      );
    } catch {
      // Keep the previous keyspace selection and collection snapshot in sync.
    }
  }, [astraEndpoint, astraFromEnv, astraToken, fetchCollections, formatKeyspacesWarning]);

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
    collectionCreateError,
    keyspaces,
    selectedKeyspace,
    handleSelectCollection,
    handleKeyspaceChange,
    handleCollectionCreateStarted: collectionLifecycle.handleCollectionCreateStarted,
    handleCollectionCreated: collectionLifecycle.handleCollectionCreated,
    handleCollectionCreateFailed,
    clearCollectionCreateError,
    handleCollectionStatsDelta: collectionLifecycle.handleCollectionStatsDelta,
    handleDeleteCollection: collectionLifecycle.handleDeleteCollection,
  };
}
