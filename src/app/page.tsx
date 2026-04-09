"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/shell/Header";
import { PlaygroundDialogs } from "@/components/shell/PlaygroundDialogs";
import { PlaygroundMainPanel } from "@/components/shell/PlaygroundMainPanel";
import { Sidebar } from "@/components/shell/Sidebar";
import { usePlaygroundState } from "@/lib/hooks/usePlaygroundState";

export default function PlaygroundPage() {
  const [ingestTarget, setIngestTarget] = useState<string | null>(null);
  const [authEnabled, setAuthEnabled] = useState(false);

  const {
    astraToken,
    astraEndpoint,
    astraFromEnv,
    huggingfaceApiKey,
    handleHuggingfaceApiKeyChange,
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
    collectionFields,
    activeCollection,
    activeCollectionObj,
    keyspaces,
    selectedKeyspace,
    handleSelectCollection,
    handleKeyspaceChange,
    handleCollectionCreated,
    viewMode,
    setViewMode,
    newCollectionOpen,
    setNewCollectionOpen,
    quickStartOpen,
    setQuickStartOpen,
    conversations,
    activeConversationId,
    handleConversationChange,
    messages,
    handleMessagesUpdate,
    handleNewConversation,
    creatingConversation,
    handleRenameConversation,
    handleDeleteConversation,
    theme,
    toggleTheme,
  } = usePlaygroundState();

  useEffect(() => {
    void fetch("/api/auth/status")
      .then((response) =>
        response.json() as Promise<{ enabled?: boolean }>
      )
      .then((payload) => setAuthEnabled(!!payload.enabled))
      .catch(() => {});
  }, []);

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <Header
        connected={isConnected}
        envReady={envReady && !isConnected}
        onConnectionClick={() =>
          isConnected ? handleDisconnect() : setConnectDialogOpen(true)
        }
        onSettingsClick={() => setQuickStartOpen(true)}
        authEnabled={authEnabled}
        onSignOut={() => void handleSignOut()}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <Sidebar
          collections={collections}
          activeCollection={activeCollection}
          viewMode={viewMode}
          onSelectCollection={(name) => {
            handleSelectCollection(name);
            setViewMode("ingest");
          }}
          onNewCollection={() => setNewCollectionOpen(true)}
          keyspaces={keyspaces}
          selectedKeyspace={selectedKeyspace}
          onKeyspaceChange={(keyspace) => void handleKeyspaceChange(keyspace)}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onConversationChange={(id) => {
            void handleConversationChange(id);
            setViewMode("chat");
          }}
          onNewConversation={() => void handleNewConversation()}
          creatingConversation={creatingConversation}
          onRenameConversation={(id, name) =>
            void handleRenameConversation(id, name)
          }
          onDeleteConversation={(id) => void handleDeleteConversation(id)}
        />

        <PlaygroundMainPanel
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          activeCollection={activeCollection}
          activeCollectionObj={activeCollectionObj}
          collections={collections}
          collectionFields={collectionFields}
          conversations={conversations}
          activeConversationId={activeConversationId}
          messages={messages}
          onMessagesUpdate={handleMessagesUpdate}
          astraToken={astraToken}
          astraEndpoint={astraEndpoint}
          keyspace={selectedKeyspace}
          huggingfaceApiKey={huggingfaceApiKey}
          initializing={initializing}
          isConnected={isConnected}
        />
      </div>

      <PlaygroundDialogs
        newCollectionOpen={newCollectionOpen}
        onCloseNewCollection={() => setNewCollectionOpen(false)}
        onCollectionCreated={handleCollectionCreated}
        astraToken={astraToken}
        astraEndpoint={astraEndpoint}
        selectedKeyspace={selectedKeyspace}
        ingestTarget={ingestTarget}
        collections={collections}
        onCloseIngestDialog={() => setIngestTarget(null)}
        quickStartOpen={quickStartOpen}
        onCloseQuickStart={() => setQuickStartOpen(false)}
        connectDialogOpen={connectDialogOpen}
        onCloseConnect={() => {
          setConnectDialogOpen(false);
          setConnectError("");
        }}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        astraFromEnv={astraFromEnv}
        huggingfaceApiKey={huggingfaceApiKey}
        onHuggingfaceApiKeyChange={handleHuggingfaceApiKeyChange}
        connectError={connectError}
        isConnected={isConnected}
      />
    </div>
  );
}
