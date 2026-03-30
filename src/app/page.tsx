"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Terminal, Upload } from "lucide-react";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";
import { AstraConnectDialog } from "@/components/connection/AstraConnectDialog";
import { QuickStartGuide } from "@/components/onboarding/QuickStartGuide";
import { ChatArea } from "@/components/chat/ChatArea";
import { NewCollectionDialog } from "@/components/collection/NewCollectionDialog";
import { IngestDialog } from "@/components/collection/IngestDialog";
import { ApiExplorer } from "@/components/api/ApiExplorer";
import { IngestTab } from "@/components/ingest/IngestTab";
import { usePlaygroundState } from "@/lib/hooks/usePlaygroundState";

export default function PlaygroundPage() {
  const [ingestTarget, setIngestTarget] = useState<string | null>(null);

  const {
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

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <Header
        connected={isConnected}
        envReady={envReady && !isConnected}
        onConnectionClick={() => isConnected ? handleDisconnect() : setConnectDialogOpen(true)}
        onSettingsClick={() => setQuickStartOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <Sidebar
          collections={collections}
          activeCollection={activeCollection}
          viewMode={viewMode}
          onSelectCollection={(name) => { handleSelectCollection(name); setViewMode("ingest"); }}
          onNewCollection={() => setNewCollectionOpen(true)}
          keyspaces={keyspaces}
          selectedKeyspace={selectedKeyspace}
          onKeyspaceChange={(ks) => void handleKeyspaceChange(ks)}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onConversationChange={(id) => { void handleConversationChange(id); setViewMode("chat"); }}
          onNewConversation={() => void handleNewConversation()}
          creatingConversation={creatingConversation}
          onRenameConversation={(id, name) => void handleRenameConversation(id, name)}
          onDeleteConversation={(id) => void handleDeleteConversation(id)}
        />

        {/* ── Main panel ── */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

          {/* View switcher */}
          <div
            className="shrink-0 flex items-center px-4 border-b"
            style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-subtle)", minHeight: "44px" }}
          >
            <div
              className="flex rounded-lg p-0.5 gap-0.5"
              style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
            >
              <motion.button
                onClick={() => setViewMode("chat")}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: viewMode === "chat" ? "var(--bg-panel)" : "transparent",
                  color: viewMode === "chat" ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: viewMode === "chat" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
                whileTap={{ scale: 0.97 }}
              >
                <MessageSquare size={12} />
                Chat
              </motion.button>
              <motion.button
                onClick={() => setViewMode("ingest")}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: viewMode === "ingest" ? "var(--bg-panel)" : "transparent",
                  color: viewMode === "ingest" ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: viewMode === "ingest" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
                whileTap={{ scale: 0.97 }}
              >
                <Upload size={12} />
                Ingest
              </motion.button>
              <motion.button
                onClick={() => setViewMode("api")}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: viewMode === "api" ? "var(--interactive-light)" : "transparent",
                  color: viewMode === "api" ? "var(--interactive)" : "var(--text-muted)",
                  boxShadow: viewMode === "api" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
                whileTap={{ scale: 0.97 }}
              >
                <Terminal size={12} />
                API
              </motion.button>
            </div>

            {/* Active collection label in API mode */}
            {viewMode === "api" && activeCollection && (
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="ml-3 text-xs"
                style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}
              >
                {activeCollection}
              </motion.span>
            )}
          </div>

          {/* Content */}
          {viewMode === "api" ? (
            <ApiExplorer
              collection={activeCollectionObj}
              astraToken={astraToken}
              astraEndpoint={astraEndpoint}
              keyspace={selectedKeyspace}
            />
          ) : viewMode === "ingest" ? (
            <IngestTab
              astraToken={astraToken}
              astraEndpoint={astraEndpoint}
              keyspace={selectedKeyspace}
              collections={collections}
              activeCollection={activeCollection}
              isConnected={isConnected}
            />
          ) : (
            <ChatArea
              conversations={conversations}
              activeConversationId={activeConversationId}
              messages={messages}
              onMessagesUpdate={handleMessagesUpdate}
              astraToken={astraToken}
              astraEndpoint={astraEndpoint}
              collections={collections.map((c) => ({ name: c.name, isVectorize: !!c.vectorizeService }))}
              activeCollection={activeCollection}
              keyspace={selectedKeyspace}
              ibmApiKey={ibmApiKey}
              watsonxProjectId={watsonxProjectId}
              collectionFields={collectionFields}
              initializing={initializing}
            />
          )}
        </div>

      </div>

      <NewCollectionDialog
        open={newCollectionOpen}
        onClose={() => setNewCollectionOpen(false)}
        onCreated={handleCollectionCreated}
        astraToken={astraToken}
        astraEndpoint={astraEndpoint}
        keyspace={selectedKeyspace}
      />

      {ingestTarget && (() => {
        const col = collections.find((c) => c.name === ingestTarget);
        return col ? (
          <IngestDialog
            collection={col}
            astraToken={astraToken}
            astraEndpoint={astraEndpoint}
            onClose={() => setIngestTarget(null)}
          />
        ) : null;
      })()}

      <QuickStartGuide open={quickStartOpen} onClose={() => setQuickStartOpen(false)} />

      <AstraConnectDialog
        open={connectDialogOpen}
        onClose={() => { setConnectDialogOpen(false); setConnectError(""); }}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        currentToken={astraFromEnv ? "" : astraToken}
        currentEndpoint={astraFromEnv ? "" : astraEndpoint}
        currentIbmApiKey={ibmApiKey}
        currentWatsonxProjectId={watsonxProjectId}
        onIbmApiKeyChange={handleIbmApiKeyChange}
        onWatsonxProjectIdChange={handleWatsonxProjectIdChange}
        error={connectError}
      />
    </div>
  );
}
