"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MessageSquare,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type { Collection, Conversation } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ConversationItem } from "./ConversationItem";
import { CollectionItem } from "./CollectionItem";

export interface SidebarProps {
  collections: Collection[];
  activeCollection: string;
  collectionCreateError?: string;
  onSelectCollection: (name: string) => void;
  onNewCollection: () => void;
  keyspaces?: string[];
  selectedKeyspace?: string;
  onKeyspaceChange?: (keyspace: string) => void;
  conversations: Conversation[];
  activeConversationId: string;
  onConversationChange: (id: string) => void;
  onNewConversation: () => void;
  creatingConversation?: boolean;
  onRenameConversation: (id: string, name: string) => void;
  onDeleteConversation: (id: string) => void;
  onDeleteCollection: (name: string) => Promise<void> | void;
  viewMode?: string;
  showCollections?: boolean;
}

export function Sidebar({
  collections,
  activeCollection,
  collectionCreateError = "",
  onSelectCollection,
  onNewCollection,
  conversations,
  activeConversationId,
  onConversationChange,
  onNewConversation,
  creatingConversation = false,
  onRenameConversation,
  onDeleteConversation,
  onDeleteCollection,
  viewMode = "chat",
  showCollections = true,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [conversationToDelete, setConversationToDelete] =
    useState<Conversation | null>(null);
  const [collectionToDelete, setCollectionToDelete] =
    useState<Collection | null>(null);
  const [deleteCollectionValue, setDeleteCollectionValue] = useState("");
  const [deletingCollectionName, setDeletingCollectionName] = useState<string | null>(
    null
  );
  const [deleteCollectionError, setDeleteCollectionError] = useState("");
  const visibleCollections = collections;

  const convActive = viewMode === "chat";
  const collActive = viewMode === "ingest" || viewMode === "api";

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 48 : 256 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="relative flex flex-col shrink-0 border-r overflow-hidden"
        style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-subtle)" }}
      >
        {/* Collapse toggle */}
        <div className="shrink-0 border-b flex" style={{ borderColor: "var(--border-subtle)" }}>
          <motion.button
            onClick={() => setCollapsed(!collapsed)}
            className="flex-1 flex items-center gap-2 px-3 py-2.5 text-xs font-medium"
            style={{ color: "var(--text-muted)", backgroundColor: "rgba(0,0,0,0)" }}
            whileHover={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}
            whileTap={{ scale: 0.97 }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
            {!collapsed && <span>Collapse</span>}
          </motion.button>
        </div>

        {!collapsed && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

            {/* Scrollable body */}
            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">

              {/* ── Conversations ── */}
              <div className="px-3 pt-1 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                    Conversations
                  </p>
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "var(--interactive-light)", color: "var(--interactive)" }}
                  >
                    {conversations.length}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {conversations.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isActive={convActive && conv.id === activeConversationId}
                      onClick={() => void onConversationChange(conv.id)}
                      onRename={(name) => void onRenameConversation(conv.id, name)}
                      onDelete={() => setConversationToDelete(conv)}
                    />
                  ))}
                  <motion.button
                    onClick={() => void onNewConversation()}
                    disabled={creatingConversation}
                    data-testid="new-conversation-button"
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium mt-0.5"
                    style={{ color: "var(--text-muted)", border: "1px dashed var(--border-subtle)", backgroundColor: "rgba(0,0,0,0)", cursor: creatingConversation ? "default" : "pointer" }}
                    whileHover={creatingConversation ? {} : { backgroundColor: "var(--interactive-light)", borderColor: "var(--interactive-border)", color: "var(--interactive)" }}
                    whileTap={creatingConversation ? {} : { scale: 0.98 }}
                  >
                    {creatingConversation ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    <span>New Conversation</span>
                  </motion.button>
                </div>
              </div>

              {showCollections && (
                <>
                  {/* Divider */}
                  <div className="mx-3 my-1 h-px shrink-0" style={{ backgroundColor: "var(--border-subtle)" }} />

                  {/* ── Collections ── */}
                  <div className="px-3 pt-1 pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Collections
                      </p>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: "var(--interactive-light)", color: "var(--interactive)" }}
                      >
                        {visibleCollections.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {visibleCollections.map((col) => (
                        <CollectionItem
                          key={col.pendingKey ?? col.name}
                          collection={col}
                          isActive={collActive && activeCollection === col.name}
                          onClick={() => {
                            if (col.creating) return;
                            onSelectCollection(col.name);
                          }}
                          onDelete={() => {
                            if (col.creating) return;
                            setCollectionToDelete(col);
                            setDeleteCollectionValue("");
                            setDeleteCollectionError("");
                          }}
                        />
                      ))}
                      {collectionCreateError ? (
                        <p
                          className="px-1 pt-1 text-[11px] leading-4"
                          style={{ color: "#fca5a5" }}
                        >
                          {collectionCreateError}
                        </p>
                      ) : null}
                      <motion.button
                        onClick={onNewCollection}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium mt-0.5"
                        style={{ color: "var(--text-muted)", border: "1px dashed var(--border-subtle)", backgroundColor: "rgba(0,0,0,0)" }}
                        whileHover={{ backgroundColor: "var(--interactive-light)", borderColor: "var(--interactive-border)", color: "var(--interactive)" }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Plus size={12} />
                        <span>New Collection</span>
                      </motion.button>
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>
        )}

        {/* Collapsed icons */}
        {collapsed && (
          <div className="flex flex-col items-center gap-2 pt-4 px-1">
            {conversations.map((conv) => (
              <motion.button
                key={conv.id}
                onClick={() => void onConversationChange(conv.id)}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: convActive && conv.id === activeConversationId ? "var(--interactive-light)" : "rgba(0,0,0,0)",
                  color: convActive && conv.id === activeConversationId ? "var(--interactive)" : "var(--text-muted)",
                  borderLeft: convActive && conv.id === activeConversationId ? "2px solid var(--interactive)" : "2px solid transparent",
                }}
                whileHover={{ backgroundColor: "var(--bg-hover)" }}
                title={conv.name}
              >
                <MessageSquare size={13} />
              </motion.button>
            ))}
            {showCollections && (
              <>
                <div className="w-4 h-px my-1" style={{ backgroundColor: "var(--border-subtle)" }} />
                {visibleCollections.map((col) => (
                  <motion.button
                    key={col.pendingKey ?? col.name}
                    onClick={() => {
                      if (col.creating) return;
                      onSelectCollection(col.name);
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold uppercase"
                    style={{
                      backgroundColor: collActive && activeCollection === col.name ? "var(--interactive-light)" : "rgba(0,0,0,0)",
                      color: collActive && activeCollection === col.name ? "var(--interactive)" : "var(--text-muted)",
                      borderLeft: collActive && activeCollection === col.name ? "2px solid var(--interactive)" : "2px solid transparent",
                    }}
                    whileHover={col.creating ? {} : { backgroundColor: "var(--bg-hover)" }}
                    title={col.name}
                  >
                    {col.creating ? <Loader2 size={12} className="animate-spin" /> : col.name[0].toUpperCase()}
                  </motion.button>
                ))}
              </>
            )}
          </div>
        )}
      </motion.aside>

      <ConfirmDialog
        open={conversationToDelete !== null}
        title="Delete conversation?"
        description={
          conversationToDelete
            ? `This will remove "${conversationToDelete.name}".`
            : ""
        }
        confirmLabel="Delete conversation"
        onClose={() => setConversationToDelete(null)}
        onConfirm={() => {
          if (!conversationToDelete) return;
          onDeleteConversation(conversationToDelete.id);
          setConversationToDelete(null);
        }}
      />

      <ConfirmDialog
        open={collectionToDelete !== null}
        title="Delete collection?"
        description={
          collectionToDelete
            ? `This permanently removes "${collectionToDelete.name}" and its data.`
            : ""
        }
        confirmLabel="Delete collection"
        confirmDisabled={deleteCollectionValue !== collectionToDelete?.name}
        confirming={deletingCollectionName === collectionToDelete?.name}
        onClose={() => {
          if (deletingCollectionName === collectionToDelete?.name) return;
          setCollectionToDelete(null);
          setDeleteCollectionValue("");
          setDeleteCollectionError("");
        }}
        onConfirm={async () => {
          if (!collectionToDelete || deleteCollectionValue !== collectionToDelete.name) {
            return;
          }

          setDeletingCollectionName(collectionToDelete.name);
          setDeleteCollectionError("");

          try {
            await onDeleteCollection(collectionToDelete.name);
            setCollectionToDelete(null);
            setDeleteCollectionValue("");
          } catch (error) {
            setDeleteCollectionError(
              error instanceof Error ? error.message : "Failed to delete collection"
            );
          } finally {
            setDeletingCollectionName(null);
          }
        }}
      >
        <div
          className="rounded-xl px-3 py-2"
          style={{
            backgroundColor: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.22)",
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={14}
              style={{ color: "#f87171", flexShrink: 0, marginTop: 1 }}
            />
            <p className="text-xs leading-5" style={{ color: "#fecaca" }}>
              This action is destructive and cannot be undone. Type the collection
              name to confirm.
            </p>
          </div>
        </div>
        <input
          autoFocus
          value={deleteCollectionValue}
          onChange={(event) => setDeleteCollectionValue(event.target.value)}
          placeholder={collectionToDelete?.name ?? "Collection name"}
          className="mt-3 w-full rounded-lg px-3 py-2 text-xs outline-none"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
            fontFamily: "IBM Plex Mono, monospace",
          }}
        />
        {deleteCollectionError ? (
          <p className="mt-2 text-xs" style={{ color: "#fca5a5" }}>
            {deleteCollectionError}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
