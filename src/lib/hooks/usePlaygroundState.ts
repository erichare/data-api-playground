"use client";

import { useCallback, useState } from "react";
import type { ViewMode } from "@/lib/types";
import type { ConnectionContextValue } from "@/lib/context/ConnectionContext";
import { usePlaygroundAuth } from "@/lib/hooks/usePlaygroundAuth";
import { useConversationState } from "@/lib/hooks/useConversationState";
import { usePlaygroundConnection } from "@/lib/hooks/usePlaygroundConnection";
import { useThemeState } from "@/lib/hooks/useThemeState";

// ── Hook ────────────────────────────────────────────────────────────────────

export function usePlaygroundState() {
  const [huggingfaceApiKey, setHuggingfaceApiKey] = useState("");

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

  const handleConnectionClick = useCallback(() => {
    if (connectionState.isConnected) {
      connectionState.handleDisconnect();
      return;
    }

    connectionState.setConnectDialogOpen(true);
  }, [connectionState]);

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

  const connectionValue: ConnectionContextValue = {
    astraToken: connectionState.astraToken,
    astraEndpoint: connectionState.astraEndpoint,
    keyspace: connectionState.selectedKeyspace,
    isConnected: connectionState.isConnected,
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
      connected: connectionState.isConnected,
      envReady: connectionState.envReady && !connectionState.isConnected,
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
      astraToken: connectionState.astraToken,
      astraEndpoint: connectionState.astraEndpoint,
      selectedKeyspace: connectionState.selectedKeyspace,
      quickStartOpen,
      onCloseQuickStart: () => setQuickStartOpen(false),
      connectDialogOpen: connectionState.connectDialogOpen,
      onCloseConnect: handleCloseConnect,
      onConnect: connectionState.handleConnect,
      onDisconnect: connectionState.handleDisconnect,
      astraFromEnv: connectionState.astraFromEnv,
      huggingfaceApiKey,
      onHuggingfaceApiKeyChange: handleHuggingfaceApiKeyChange,
      connectError: connectionState.connectError,
      isConnected: connectionState.isConnected,
    },
  };
}
