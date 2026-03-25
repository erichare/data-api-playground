"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plug, Beaker, ArrowRight, Database, MessageSquare, Table2 } from "lucide-react";
import { Header } from "@/components/shell/Header";
import { Sidebar } from "@/components/shell/Sidebar";
import { AstraConnectDialog } from "@/components/connection/AstraConnectDialog";
import { QuickStartGuide } from "@/components/onboarding/QuickStartGuide";
import { ChatArea } from "@/components/chat/ChatArea";
import { CollectionViewer } from "@/components/collection/CollectionViewer";
import { NewCollectionDialog } from "@/components/collection/NewCollectionDialog";
import { DeleteCollectionDialog } from "@/components/collection/DeleteCollectionDialog";
import { IngestPanel } from "@/components/collection/IngestPanel";
import { usePlaygroundState } from "@/lib/hooks/usePlaygroundState";

export default function PlaygroundPage() {
  const [deleteCollectionTarget, setDeleteCollectionTarget] = useState<string | null>(null);

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
    setCollections,
    collectionFields,
    activeCollection,
    activeCollectionObj,
    keyspaces,
    selectedKeyspace,
    handleSelectCollection,
    handleKeyspaceChange,
    handleCollectionCreated,
    handleDeleteCollection,
    viewMode,
    setViewMode,
    ingestCollapsed,
    setIngestCollapsed,
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
    demoModeAccepted,
    setDemoModeAccepted,
    theme,
    toggleTheme,
  } = usePlaygroundState();

  const showLanding = !initializing && !isConnected && !demoModeAccepted;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <Header
        connected={isConnected}
        envReady={envReady && !isConnected}
        onConnectionClick={() => setConnectDialogOpen(true)}
        onSettingsClick={() => setQuickStartOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <Sidebar
          collections={collections}
          activeCollection={activeCollection}
          viewMode={viewMode}
          onSelectCollection={handleSelectCollection}
          onSelectChat={() => setViewMode("chat")}
          onNewCollection={() => setNewCollectionOpen(true)}
          onDeleteCollection={(name) => setDeleteCollectionTarget(name)}
          keyspaces={keyspaces}
          selectedKeyspace={selectedKeyspace}
          onKeyspaceChange={(ks) => void handleKeyspaceChange(ks)}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onConversationChange={(id) => void handleConversationChange(id)}
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
                onClick={() => activeCollection && handleSelectCollection(activeCollection)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: viewMode === "browse" ? "var(--interactive-light)" : "transparent",
                  color: viewMode === "browse" ? "var(--interactive)" : "var(--text-muted)",
                  boxShadow: viewMode === "browse" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
                whileTap={{ scale: 0.97 }}
              >
                <Table2 size={12} />
                Browse
              </motion.button>
            </div>

            {/* Active collection label in Browse mode */}
            {viewMode === "browse" && activeCollection && (
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
          {viewMode === "browse" && activeCollectionObj ? (
            <CollectionViewer
              collection={activeCollectionObj}
              onSwitchToChat={() => setViewMode("chat")}
              astraToken={astraToken}
              astraEndpoint={astraEndpoint}
              onCountChange={(name, exactCount) =>
                setCollections((prev) =>
                  prev.map((c) => c.name === name ? { ...c, count: exactCount } : c)
                )
              }
              onOpenIngest={() => setIngestCollapsed(false)}
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
              ibmApiKey={ibmApiKey}
              watsonxProjectId={watsonxProjectId}
              collectionFields={collectionFields}
              initializing={initializing}
            />
          )}
        </div>

        <IngestPanel
          collections={collections}
          astraToken={astraToken}
          astraEndpoint={astraEndpoint}
          collapsed={ingestCollapsed}
          onCollapsedChange={setIngestCollapsed}
        />

        {/* ── Landing screen ── */}
        <AnimatePresence>
          {showLanding && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-20"
              style={{ backgroundColor: "var(--bg-overlay)", backdropFilter: "blur(6px)" }}
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.97 }}
                transition={{ delay: 0.05, duration: 0.3, ease: "easeOut" }}
                className="flex flex-col items-center gap-8 text-center px-8 py-10 rounded-2xl max-w-lg w-full mx-4"
                style={{
                  backgroundColor: "var(--bg-panel)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "0 32px 80px rgba(0,0,0,0.25)",
                }}
              >
                {/* Logo mark */}
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: "var(--interactive-light)", border: "1px solid var(--interactive-border)" }}
                  >
                    <Database size={22} style={{ color: "var(--interactive)" }} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>
                      DataStax Astra DB
                    </p>
                    <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                      Data API Playground
                    </h1>
                    <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      Explore vector search, AI queries, and the Data API — with your own data or a built-in demo.
                    </p>
                  </div>
                </div>

                {/* Choice cards */}
                <div className="grid grid-cols-2 gap-3 w-full">
                  {/* Demo Mode */}
                  <motion.button
                    onClick={() => setDemoModeAccepted(true)}
                    className="flex flex-col items-start gap-3 p-4 rounded-xl text-left"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                    }}
                    whileHover={{ borderColor: "var(--border-strong)", backgroundColor: "var(--bg-hover)" }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "rgba(108,99,255,0.12)", border: "1px solid rgba(108,99,255,0.25)" }}
                    >
                      <Beaker size={15} style={{ color: "#6c63ff" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>
                        Try Demo
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        Sample data, no credentials needed
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs" style={{ color: "#6c63ff" }}>
                      Start exploring <ArrowRight size={11} />
                    </div>
                  </motion.button>

                  {/* Connect */}
                  <motion.button
                    onClick={() => { setDemoModeAccepted(true); setConnectDialogOpen(true); }}
                    className="flex flex-col items-start gap-3 p-4 rounded-xl text-left"
                    style={{
                      backgroundColor: "var(--interactive-light)",
                      border: "1px solid var(--interactive-border)",
                    }}
                    whileHover={{ opacity: 0.85 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "var(--interactive-light)", border: "1px solid var(--interactive-border)" }}
                    >
                      <Plug size={15} style={{ color: "var(--interactive)" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>
                        Connect to Astra DB
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        Full experience with your own data
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs" style={{ color: "var(--interactive)" }}>
                      Enter credentials <ArrowRight size={11} />
                    </div>
                  </motion.button>
                </div>

                {envReady && (
                  <p className="text-[11px]" style={{ color: "#22c55e" }}>
                    ✓ Astra DB credentials detected in environment
                  </p>
                )}

                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Credentials are stored in session memory only and never sent to third parties.
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <NewCollectionDialog
        open={newCollectionOpen}
        onClose={() => setNewCollectionOpen(false)}
        onCreated={handleCollectionCreated}
        astraToken={astraToken}
        astraEndpoint={astraEndpoint}
      />

      <DeleteCollectionDialog
        collectionName={deleteCollectionTarget}
        onClose={() => setDeleteCollectionTarget(null)}
        onConfirm={(name) => void handleDeleteCollection(name)}
      />

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
