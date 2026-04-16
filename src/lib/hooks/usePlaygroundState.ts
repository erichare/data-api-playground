"use client";

import { useCallback, useEffect, useState } from "react";
import type { ViewMode } from "@/lib/types";
import type { ConnectionContextValue } from "@/lib/context/ConnectionContext";
import { usePlaygroundAuth } from "@/lib/hooks/usePlaygroundAuth";
import { useConversationState } from "@/lib/hooks/useConversationState";
import { usePlaygroundConnection } from "@/lib/hooks/usePlaygroundConnection";
import { useThemeState } from "@/lib/hooks/useThemeState";
import {
  getKnowledgeBackendCapabilities,
  getResolvedKnowledgeBackendKind,
  type KnowledgeBackendMode,
  type OpenragKnowledgeState,
} from "@/lib/knowledge/types";

// ── Hook ────────────────────────────────────────────────────────────────────

export function usePlaygroundState() {
  const [huggingfaceApiKey, setHuggingfaceApiKey] = useState("");
  const [knowledgeBackendMode, setKnowledgeBackendMode] =
    useState<KnowledgeBackendMode>("connected");
  const [openragConnection, setOpenragConnection] =
    useState<OpenragKnowledgeState | null>(null);

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const handleHuggingfaceApiKeyChange = (key: string) => {
    setHuggingfaceApiKey(key);
  };
  const authState = usePlaygroundAuth();
  const themeState = useThemeState();

  const conversationState = useConversationState({
    huggingfaceApiKey,
    onConversationActivated: () => setViewMode("chat"),
  });

  const connectionState = usePlaygroundConnection({
    bootstrapConversations: conversationState.bootstrapConversations,
    resetConversationTracking: conversationState.resetConversationTracking,
    onDisconnectViewReset: () => setViewMode("chat"),
  });
  const openragConfigured =
    knowledgeBackendMode === "openrag" && openragConnection?.kind === "openrag";
  const appConnected = connectionState.isConnected || openragConfigured;

  const handleDisconnect = useCallback(() => {
    setKnowledgeBackendMode("connected");
    setOpenragConnection(null);
    connectionState.handleDisconnect();
  }, [connectionState]);

  const handleConnectionClick = useCallback(() => {
    if (appConnected) {
      handleDisconnect();
      return;
    }

    connectionState.setConnectDialogOpen(true);
  }, [appConnected, connectionState, handleDisconnect]);

  const handleCloseConnect = useCallback(() => {
    connectionState.setConnectDialogOpen(false);
    connectionState.setConnectError("");
  }, [connectionState]);

  const handleSidebarCollectionSelect = useCallback(
    (name: string) => {
      connectionState.handleSelectCollection(name);
      setViewMode("ingest");
    },
    [connectionState]
  );

  const handleSidebarConversationChange = useCallback(
    async (id: string) => {
      setViewMode("chat");
      await conversationState.handleConversationChange(id);
    },
    [conversationState]
  );

  const resolvedCollections = connectionState.collections.filter(
    (collection) => !collection.creating
  );
  const resolvedActiveCollectionObj =
    resolvedCollections.find(
      (collection) => collection.name === connectionState.activeCollection
    ) ?? resolvedCollections[0];
  const openragActive = knowledgeBackendMode === "openrag";
  const knowledgeBackendKind = getResolvedKnowledgeBackendKind({
    selectedBackend: connectionState.selectedBackend,
    knowledgeBackendMode,
  });
  const knowledgeCapabilities =
    getKnowledgeBackendCapabilities(knowledgeBackendKind);

  useEffect(() => {
    if (openragActive && viewMode === "api") {
      setViewMode("chat");
    }
  }, [openragActive, viewMode]);

  const connectionValue: ConnectionContextValue = {
    connection: connectionState.connection,
    astraToken: connectionState.astraToken,
    astraEndpoint: connectionState.astraEndpoint,
    astraFromEnv: connectionState.astraFromEnv,
    selectedBackend: connectionState.selectedBackend,
    knowledgeBackendMode,
    knowledgeBackendKind,
    knowledgeCapabilities,
    openragConnection,
    capabilities: connectionState.capabilities,
    keyspace: connectionState.selectedKeyspace,
    isConnected: appConnected,
    initializing: connectionState.initializing,
    collections: resolvedCollections,
    activeCollection: connectionState.activeCollection,
    activeCollectionObj: resolvedActiveCollectionObj,
    collectionFields: connectionState.collectionFields,
    huggingfaceApiKey,
  };

  return {
    connectionValue,
    headerProps: {
      connected: appConnected,
      envReady: connectionState.envReady && !appConnected,
      selectedBackend: connectionState.selectedBackend,
      onConnectionClick: handleConnectionClick,
      onSettingsClick: () => setQuickStartOpen(true),
      authEnabled: authState.authEnabled,
      onSignOut: authState.handleSignOut,
      theme: themeState.theme,
      onToggleTheme: themeState.toggleTheme,
    },
    sidebarProps: {
      collections: connectionState.collections,
      activeCollection: connectionState.activeCollection,
      collectionCreateError: connectionState.collectionCreateError,
      showCollections: !openragActive,
      viewMode,
      onSelectCollection: handleSidebarCollectionSelect,
      onNewCollection: () => {
        connectionState.clearCollectionCreateError();
        setNewCollectionOpen(true);
      },
      keyspaces: connectionState.keyspaces,
      selectedKeyspace: connectionState.selectedKeyspace,
      onKeyspaceChange: (keyspace: string) =>
        void connectionState.handleKeyspaceChange(keyspace),
      conversations: conversationState.conversations,
      activeConversationId: conversationState.activeConversationId,
      onConversationChange: (id: string) =>
        void handleSidebarConversationChange(id),
      onNewConversation: () => void conversationState.handleNewConversation(),
      creatingConversation: conversationState.creatingConversation,
      onRenameConversation: (id: string, name: string) =>
        void conversationState.handleRenameConversation(id, name),
      onDeleteConversation: (id: string) =>
        void conversationState.handleDeleteConversation(id),
      onDeleteCollection: (name: string) =>
        connectionState.handleDeleteCollection(name),
    },
    mainPanelProps: {
      viewMode,
      showApiExplorer: !openragActive,
      onViewModeChange: setViewMode,
      conversations: conversationState.conversations,
      activeConversationId: conversationState.activeConversationId,
      messages: conversationState.messages,
      onMessagesUpdate: conversationState.handleMessagesUpdate,
      onCollectionStatsDelta: connectionState.handleCollectionStatsDelta,
    },
    dialogsProps: {
      newCollectionOpen,
      onCloseNewCollection: () => setNewCollectionOpen(false),
      onCollectionCreateStarted: connectionState.handleCollectionCreateStarted,
      onCollectionCreateFailed: connectionState.handleCollectionCreateFailed,
      onCollectionCreated: connectionState.handleCollectionCreated,
      connection: connectionState.connection,
      selectedBackend: connectionState.selectedBackend,
      knowledgeBackendMode,
      openragConnection,
      onSelectedBackendChange: connectionState.setSelectedBackend,
      onKnowledgeBackendModeChange: setKnowledgeBackendMode,
      onOpenragConnectionChange: setOpenragConnection,
      backendStatuses: connectionState.backendStatuses,
      capabilities: connectionState.capabilities,
      selectedKeyspace: connectionState.selectedKeyspace,
      quickStartOpen,
      onCloseQuickStart: () => setQuickStartOpen(false),
      connectDialogOpen: connectionState.connectDialogOpen,
      onCloseConnect: handleCloseConnect,
      onConnect: connectionState.handleConnect,
      onDisconnect: handleDisconnect,
      huggingfaceApiKey,
      onHuggingfaceApiKeyChange: handleHuggingfaceApiKeyChange,
      connectError: connectionState.connectError,
      isConnected: connectionState.isConnected,
      backendConnected: appConnected,
    },
  };
}
