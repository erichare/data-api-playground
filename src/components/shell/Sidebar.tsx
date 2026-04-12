"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MessageSquare,
  Loader2,
} from "lucide-react";
import type { Collection, Conversation } from "@/lib/types";
import { ConversationItem } from "./ConversationItem";
import { CollectionItem } from "./CollectionItem";

export interface SidebarProps {
  collections: Collection[];
  activeCollection: string;
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
  viewMode?: string;
}

export function Sidebar({
  collections,
  activeCollection,
  onSelectCollection,
  onNewCollection,
  conversations,
  activeConversationId,
  onConversationChange,
  onNewConversation,
  creatingConversation = false,
  onRenameConversation,
  onDeleteConversation,
  viewMode = "chat",
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const visibleCollections = collections.filter((c) => !c.name.startsWith("dap_"));

  const convActive = viewMode === "chat";
  const collActive = viewMode === "ingest" || viewMode === "api";

  return (
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
                    onDelete={() => void onDeleteConversation(conv.id)}
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
                  style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}
                >
                  {visibleCollections.length}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {visibleCollections.map((col) => (
                  <CollectionItem
                    key={col.name}
                    collection={col}
                    isActive={collActive && activeCollection === col.name}
                    onClick={() => onSelectCollection(col.name)}
                  />
                ))}
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
          <div className="w-4 h-px my-1" style={{ backgroundColor: "var(--border-subtle)" }} />
          {visibleCollections.map((col) => (
            <motion.button
              key={col.name}
              onClick={() => onSelectCollection(col.name)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold uppercase"
              style={{
                backgroundColor: collActive && activeCollection === col.name ? "var(--interactive-light)" : "rgba(0,0,0,0)",
                color: collActive && activeCollection === col.name ? "var(--interactive)" : "var(--text-muted)",
                borderLeft: collActive && activeCollection === col.name ? "2px solid var(--interactive)" : "2px solid transparent",
              }}
              whileHover={{ backgroundColor: "var(--bg-hover)" }}
              title={col.name}
            >
              {col.name[0].toUpperCase()}
            </motion.button>
          ))}
        </div>
      )}
    </motion.aside>
  );
}

