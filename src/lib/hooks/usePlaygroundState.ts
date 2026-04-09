"use client";

import { useState } from "react";
import type { ViewMode } from "@/lib/types";
import { useConversationState } from "@/lib/hooks/useConversationState";
import { usePlaygroundConnection } from "@/lib/hooks/usePlaygroundConnection";

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

  const conversationState = useConversationState({
    huggingfaceApiKey,
    onConversationActivated: () => setViewMode("chat"),
  });

  const connectionState = usePlaygroundConnection({
    bootstrapConversations: conversationState.bootstrapConversations,
    resetConversationTracking: conversationState.resetConversationTracking,
    onDisconnectViewReset: () => setViewMode("chat"),
  });

  return {
    // Connection
    astraToken: connectionState.astraToken,
    astraEndpoint: connectionState.astraEndpoint,
    astraFromEnv: connectionState.astraFromEnv,
    huggingfaceApiKey,
    handleHuggingfaceApiKeyChange,
    envReady: connectionState.envReady,
    initializing: connectionState.initializing,
    isConnected: connectionState.isConnected,
    connectDialogOpen: connectionState.connectDialogOpen,
    setConnectDialogOpen: connectionState.setConnectDialogOpen,
    connectError: connectionState.connectError,
    setConnectError: connectionState.setConnectError,
    handleConnect: connectionState.handleConnect,
    handleDisconnect: connectionState.handleDisconnect,

    // Theme
    theme: connectionState.theme,
    toggleTheme: connectionState.toggleTheme,

    // Collections / keyspaces
    collections: connectionState.collections,
    setCollections: connectionState.setCollections,
    collectionFields: connectionState.collectionFields,
    activeCollection: connectionState.activeCollection,
    activeCollectionObj: connectionState.activeCollectionObj,
    keyspaces: connectionState.keyspaces,
    selectedKeyspace: connectionState.selectedKeyspace,
    handleSelectCollection: connectionState.handleSelectCollection,
    handleKeyspaceChange: connectionState.handleKeyspaceChange,
    handleCollectionCreated: connectionState.handleCollectionCreated,

    // UI
    viewMode,
    setViewMode,
    newCollectionOpen,
    setNewCollectionOpen,
    quickStartOpen,
    setQuickStartOpen,

    // Conversations
    conversations: conversationState.conversations,
    activeConversationId: conversationState.activeConversationId,
    handleConversationChange: conversationState.handleConversationChange,
    messages: conversationState.messages,
    handleMessagesUpdate: conversationState.handleMessagesUpdate,
    handleNewConversation: conversationState.handleNewConversation,
    creatingConversation: conversationState.creatingConversation,
    handleRenameConversation: conversationState.handleRenameConversation,
    handleDeleteConversation: conversationState.handleDeleteConversation,
  };
}
