"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plug } from "lucide-react";
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
  } = usePlaygroundState();

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: "#0b0f1a" }}>
      <Header
        connected={isConnected}
        envReady={envReady && !isConnected}
        onConnectionClick={() => setConnectDialogOpen(true)}
        onSettingsClick={() => setQuickStartOpen(true)}
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

        <IngestPanel
          collections={collections}
          astraToken={astraToken}
          astraEndpoint={astraEndpoint}
          collapsed={ingestCollapsed}
          onCollapsedChange={setIngestCollapsed}
        />

        {/* Connect gate overlay */}
        {!initializing && !isConnected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center z-20"
            style={{ backgroundColor: "rgba(11,15,26,0.85)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.05, duration: 0.25 }}
              className="flex flex-col items-center gap-5 text-center px-8 py-10 rounded-2xl max-w-sm"
              style={{ backgroundColor: "#0d1220", border: "1px solid #1e2d4a", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(0,194,203,0.15), rgba(108,99,255,0.15))", border: "1px solid rgba(0,194,203,0.25)" }}
              >
                <Plug size={22} style={{ color: "#00c2cb" }} />
              </div>
              <div>
                <h2 className="text-base font-semibold mb-1.5" style={{ color: "#f8fafc" }}>
                  Connect to Astra DB
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                  Add your Application Token and API Endpoint to start exploring your collections.
                </p>
              </div>
              <motion.button
                onClick={() => setConnectDialogOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{
                  background: "linear-gradient(135deg, #00c2cb, #0099a3)",
                  color: "#fff",
                  boxShadow: "0 2px 16px rgba(0,194,203,0.3)",
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Plug size={14} />
                Connect Now
              </motion.button>
              {envReady && (
                <p className="text-[11px]" style={{ color: "#4ade80" }}>
                  ✓ Credentials detected in environment
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
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
