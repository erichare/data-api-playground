"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BackendCapabilities,
  BackendConnectionState,
  BackendStatuses,
  DataApiBackendKind,
} from "@/lib/backends/types";
import { normalizeEndpoint } from "@/lib/backends/types";
import type { Collection } from "@/lib/types";
import { fetchCollectionsFromApi } from "@/lib/playground/client";
import { useCollectionLifecycle } from "@/lib/hooks/useCollectionLifecycle";

interface UsePlaygroundConnectionArgs {
  bootstrapConversations: () => Promise<string>;
  resetConversationTracking: () => void;
  onDisconnectViewReset?: () => void;
  initialAstraEndpoint?: string;
}

const DEFAULT_CAPABILITIES: BackendCapabilities = {
  connect: true,
  keyspaces: true,
  collectionCrud: true,
  embeddingProviders: true,
  vectorizeCollections: true,
  rawBrowse: true,
  deleteDocuments: true,
  apiProxy: true,
};

function normalizeBackendStatuses(
  input: BackendStatuses | { hasToken?: boolean; hasEndpoint?: boolean }
): BackendStatuses {
  if ("astra" in input && "hcd" in input) {
    return input;
  }

  const legacy = input as { hasToken?: boolean; hasEndpoint?: boolean };
  const ready = Boolean(legacy.hasToken && legacy.hasEndpoint);
  return {
    astra: {
      kind: "astra",
      ready,
      hasToken: Boolean(legacy.hasToken),
      hasEndpoint: Boolean(legacy.hasEndpoint),
    },
    hcd: {
      kind: "hcd",
      ready: false,
      hasEndpoint: false,
      hasUsername: false,
      hasPassword: false,
    },
    defaultBackend: ready ? "astra" : null,
  };
}

function createEnvConnection(kind: DataApiBackendKind): BackendConnectionState {
  return kind === "hcd"
    ? {
        backend: "hcd",
        endpoint: "",
        username: "",
        password: "",
        fromEnv: true,
      }
    : {
        backend: "astra",
        endpoint: "",
        token: "",
        fromEnv: true,
      };
}

export function usePlaygroundConnection({
  bootstrapConversations,
  resetConversationTracking,
  onDisconnectViewReset,
  initialAstraEndpoint = "",
}: UsePlaygroundConnectionArgs) {
  const bootstrapConversationsRef = useRef(bootstrapConversations);
  const resetConversationTrackingRef = useRef(resetConversationTracking);
  const onDisconnectViewResetRef = useRef(onDisconnectViewReset);
  useEffect(() => {
    bootstrapConversationsRef.current = bootstrapConversations;
    resetConversationTrackingRef.current = resetConversationTracking;
    onDisconnectViewResetRef.current = onDisconnectViewReset;
  }, [bootstrapConversations, onDisconnectViewReset, resetConversationTracking]);
  const [connection, setConnection] = useState<BackendConnectionState | null>(null);
  const [selectedBackend, setSelectedBackend] =
    useState<DataApiBackendKind>("astra");
  const [backendStatuses, setBackendStatuses] = useState<BackendStatuses | null>(null);
  const [capabilities, setCapabilities] =
    useState<BackendCapabilities>(DEFAULT_CAPABILITIES);
  const [initializing, setInitializing] = useState(true);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionFields, setCollectionFields] = useState<Record<string, string[]>>({});
  const [activeCollection, setActiveCollection] = useState("");
  const [collectionCreateError, setCollectionCreateError] = useState("");
  const [keyspaces, setKeyspaces] = useState<string[]>([]);
  const [selectedKeyspace, setSelectedKeyspace] = useState("default_keyspace");

  const collectionLifecycle = useCollectionLifecycle({
    collections,
    setCollections,
    setCollectionFields,
    setActiveCollection,
    connection,
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

  const applyConnectionResult = useCallback((
    result: Awaited<ReturnType<typeof fetchCollectionsFromApi>>,
    nextConnection: BackendConnectionState
  ) => {
    setConnection({
      ...nextConnection,
      ...(result.resolvedKeyspace ? { keyspace: result.resolvedKeyspace } : {}),
    });
    setCapabilities(result.capabilities);
    setCollections(result.collections);
    setCollectionFields(result.fields);
    setKeyspaces(result.keyspaces);
    const resolvedKeyspace = result.resolvedKeyspace ?? nextConnection.keyspace;
    if (resolvedKeyspace) {
      setSelectedKeyspace(resolvedKeyspace);
    } else if (result.keyspaces.length > 0) {
      setSelectedKeyspace(result.keyspaces[0]);
    }
    const firstUserCollection = result.collections[0]?.name ?? "";
    setActiveCollection(firstUserCollection);
  }, []);

  const fetchCollections = useCallback(async (
    nextConnection: BackendConnectionState,
    keyspace?: string
  ) => {
    const result = await fetchCollectionsFromApi(nextConnection, keyspace);
    setCollections(result.collections);
    setCollectionFields(result.fields);
    setKeyspaces(result.keyspaces);
    setCapabilities(result.capabilities);
    setActiveCollection(result.collections[0]?.name ?? "");
    if (result.resolvedKeyspace) {
      setSelectedKeyspace(result.resolvedKeyspace);
    } else if (keyspace) {
      setSelectedKeyspace(keyspace);
    }
    return result;
  }, []);

  useEffect(() => {
    const restorePromise = (async () => {
      await bootstrapConversationsRef.current().catch(() => {
        // Keep the local placeholder conversation when persisted bootstrap fails.
      });

      try {
        const statuses = await fetch("/api/backend-status")
          .then((response) =>
            response.json() as Promise<BackendStatuses | { hasToken?: boolean; hasEndpoint?: boolean }>
          )
          .then(normalizeBackendStatuses)
          .catch(async () => {
            const fallback = await fetch("/api/astra-status").then((response) =>
              response.json() as Promise<{ hasToken: boolean; hasEndpoint: boolean }>
            );
            return normalizeBackendStatuses(fallback);
          });
        setBackendStatuses(statuses);
        if (statuses.defaultBackend) {
          setSelectedBackend(statuses.defaultBackend);
          const envConnection =
            statuses.defaultBackend === "astra"
              ? {
                  backend: "astra" as const,
                  endpoint: initialAstraEndpoint,
                  token: "",
                  fromEnv: true,
                }
              : createEnvConnection(statuses.defaultBackend);
          await fetchCollectionsFromApi(envConnection)
            .then((result) => {
              applyConnectionResult(result, envConnection);
            })
            .catch(() => {
              // Env-based auto-connect failed; user can connect manually via dialog.
            });
        }
      } catch {
        // Backend status endpoint unreachable during init — non-critical.
      }
    })();

    void restorePromise.finally(() => setInitializing(false));
  }, [applyConnectionResult, fetchCollections, initialAstraEndpoint]);

  const handleConnect = useCallback(async (
    nextConnectionOrToken: BackendConnectionState | string,
    legacyEndpoint?: string
  ) => {
    setConnectError("");
    const nextConnection =
      typeof nextConnectionOrToken === "string"
        ? {
            backend: "astra" as const,
            token: nextConnectionOrToken,
            endpoint: normalizeEndpoint(legacyEndpoint ?? ""),
          }
        : nextConnectionOrToken;
    setSelectedBackend(nextConnection.backend);
    try {
      const result = await fetchCollections(nextConnection, nextConnection.keyspace);
      applyConnectionResult(result, nextConnection);
      resetConversationTrackingRef.current();
      await bootstrapConversationsRef.current().catch(() => {
        // A conversation refresh failure should not block a successful connect.
      });
      if (result.keyspacesError) {
        const message = `Connected, but keyspaces could not be listed. ${result.keyspacesError}`;
        setConnectError(message);
        throw new Error(message);
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connection failed");
      throw err;
    }
  }, [applyConnectionResult, fetchCollections]);

  const handleDisconnect = useCallback(() => {
    setConnection(null);
    setCapabilities(DEFAULT_CAPABILITIES);
    setCollections([]);
    setCollectionFields({});
    setActiveCollection("");
    setCollectionCreateError("");
    setKeyspaces([]);
    setSelectedKeyspace("default_keyspace");
    resetConversationTrackingRef.current();
    onDisconnectViewResetRef.current?.();
    void bootstrapConversationsRef.current().catch(() => {
      // Best-effort conversation bootstrap after disconnect.
    });
  }, []);

  const handleSelectCollection = useCallback((name: string) => {
    setActiveCollection(name);
  }, []);

  const handleKeyspaceChange = useCallback(async (keyspace: string) => {
    if (!connection) {
      setSelectedKeyspace(keyspace);
      return;
    }

    try {
      const result = await fetchCollections(connection, keyspace);
      setKeyspaces(result.keyspaces);
      setSelectedKeyspace(result.resolvedKeyspace ?? keyspace);
    } catch {
      // Keep the previous keyspace selection and collection snapshot in sync.
    }
  }, [connection, fetchCollections]);

  const isConnected = !!connection;
  const activeCollectionObj = collections.find((c) => c.name === activeCollection) ?? collections[0];
  const envReady = selectedBackend === "hcd"
    ? Boolean(backendStatuses?.hcd?.ready)
    : Boolean(backendStatuses?.astra?.ready);
  const astraConnection = connection?.backend === "astra" ? connection : null;

  return {
    connection,
    astraToken: astraConnection?.token ?? "",
    astraEndpoint: astraConnection?.endpoint ?? "",
    astraFromEnv: Boolean(astraConnection?.fromEnv),
    selectedBackend,
    setSelectedBackend,
    backendStatuses,
    capabilities,
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
