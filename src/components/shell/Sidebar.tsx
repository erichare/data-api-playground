"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Plus,
  ChevronDown,
  MessageSquare,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
} from "lucide-react";
import type { Collection, Conversation, ViewMode } from "@/lib/types";

interface SidebarProps {
  collections: Collection[];
  activeCollection: string;
  viewMode: ViewMode;
  onSelectCollection: (name: string) => void;
  onSelectChat: () => void;
  onNewCollection: () => void;
  onDeleteCollection: (name: string) => void;
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
}

export function Sidebar({
  collections,
  activeCollection,
  viewMode,
  onSelectCollection,
  onSelectChat,
  onNewCollection,
  onDeleteCollection,
  keyspaces = [],
  selectedKeyspace = "default_keyspace",
  onKeyspaceChange,
  conversations,
  activeConversationId,
  onConversationChange,
  onNewConversation,
  creatingConversation = false,
  onRenameConversation,
  onDeleteConversation,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showInternal, setShowInternal] = useState(false);
  const sortedCollections = [
    ...collections.filter((c) => !c.name.startsWith("dap_")),
    ...collections.filter((c) => c.name.startsWith("dap_")),
  ];
  const visibleCollections = showInternal ? sortedCollections : sortedCollections.filter((c) => !c.name.startsWith("dap_"));

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
          style={{ color: "var(--text-muted)" }}
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
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "var(--interactive-light)", color: "var(--interactive)" }}
                  >
                    {conversations.length}
                  </span>
                  <motion.button
                    onClick={() => void onNewConversation()}
                    disabled={creatingConversation}
                    className="w-5 h-5 rounded flex items-center justify-center"
                    style={{ color: creatingConversation ? "var(--interactive)" : "var(--text-muted)", cursor: creatingConversation ? "default" : "pointer" }}
                    whileHover={creatingConversation ? {} : { backgroundColor: "var(--interactive-light)", color: "var(--interactive)" }}
                    whileTap={creatingConversation ? {} : { scale: 0.9 }}
                    title="New conversation"
                  >
                    {creatingConversation
                      ? <Loader2 size={11} className="animate-spin" />
                      : <Plus size={11} />
                    }
                  </motion.button>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                {conversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === activeConversationId}
                    onClick={() => void onConversationChange(conv.id)}
                    onRename={(name) => void onRenameConversation(conv.id, name)}
                    onDelete={() => void onDeleteConversation(conv.id)}
                  />
                ))}
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
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}
                  >
                    {visibleCollections.length}
                  </span>
                  <button
                    onClick={() => setShowInternal((v) => !v)}
                    className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{
                      color: showInternal ? "var(--interactive)" : "var(--text-muted)",
                      backgroundColor: showInternal ? "var(--interactive-light)" : "transparent",
                      border: `1px solid ${showInternal ? "var(--interactive-border)" : "transparent"}`,
                    }}
                    title={showInternal ? "Hide internal collections" : "Show internal collections"}
                  >
                    {showInternal ? "–internal" : "+internal"}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                {visibleCollections.map((col) => (
                  <CollectionItem
                    key={col.name}
                    collection={col}
                    isActive={activeCollection === col.name}
                    onClick={() => onSelectCollection(col.name)}
                    onDelete={() => onDeleteCollection(col.name)}
                  />
                ))}
              </div>
            </div>

          </div>

          {/* New Collection — pinned at bottom */}
          <div className="px-3 pb-3 pt-2 shrink-0">
            <div className="h-px mb-3" style={{ backgroundColor: "var(--border-subtle)" }} />
            <motion.button
              onClick={onNewCollection}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ color: "var(--text-muted)", border: "1px dashed var(--border-subtle)" }}
              whileHover={{ backgroundColor: "var(--interactive-light)", borderColor: "var(--interactive-border)", color: "var(--interactive)" }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus size={14} />
              <span>New Collection</span>
            </motion.button>
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
                backgroundColor: conv.id === activeConversationId ? "var(--interactive-light)" : "transparent",
                color: conv.id === activeConversationId ? "var(--interactive)" : "var(--text-muted)",
                borderLeft: conv.id === activeConversationId ? "2px solid var(--interactive)" : "2px solid transparent",
              }}
              whileHover={{ backgroundColor: "var(--bg-hover)" }}
              title={conv.name}
            >
              <MessageSquare size={13} />
            </motion.button>
          ))}
          <div className="w-4 h-px my-1" style={{ backgroundColor: "var(--border-subtle)" }} />
          {collections.map((col) => (
            <motion.button
              key={col.name}
              onClick={() => onSelectCollection(col.name)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold uppercase"
              style={{
                backgroundColor: activeCollection === col.name ? "var(--interactive-light)" : "transparent",
                color: activeCollection === col.name ? "var(--interactive)" : "var(--text-muted)",
                borderLeft: activeCollection === col.name ? "2px solid var(--interactive)" : "2px solid transparent",
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

// ── ConversationItem ──────────────────────────────────────────────────────────

function ConversationItem({
  conversation,
  isActive,
  onClick,
  onRename,
  onDelete,
}: {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(conversation.name);

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== conversation.name) onRename(trimmed);
    else setEditValue(conversation.name);
    setEditing(false);
  };

  const cancelRename = () => {
    setEditValue(conversation.name);
    setEditing(false);
  };

  const count = conversation.messageCount || conversation.messages.length;

  return (
    <div
      className="relative rounded-lg"
      style={{
        backgroundColor: isActive ? "var(--interactive-light)" : "transparent",
        borderLeft: `2px solid ${isActive ? "var(--interactive)" : "transparent"}`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {editing ? (
        <div className="flex items-center gap-1 px-2 py-1.5">
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelRename();
            }}
            className="flex-1 min-w-0 text-xs bg-transparent outline-none"
            style={{ color: "var(--text-primary)", borderBottom: "1px solid var(--interactive)" }}
          />
          <button onClick={commitRename} className="p-0.5 rounded" style={{ color: "#22c55e" }}>
            <Check size={11} />
          </button>
          <button onClick={cancelRename} className="p-0.5 rounded" style={{ color: "var(--text-muted)" }}>
            <X size={11} />
          </button>
        </div>
      ) : (
        <div className="flex items-center px-2.5 py-2 rounded-lg">
          <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onDoubleClick={() => { setEditing(true); setEditValue(conversation.name); }}
            onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
            className="flex flex-col min-w-0 flex-1 cursor-pointer"
          >
            <span className="text-xs font-medium truncate" style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>
              {conversation.name}
            </span>
            {count > 0 && (
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {count} {count === 1 ? "message" : "messages"}
              </span>
            )}
          </div>

          <div
            className="flex items-center gap-0.5 shrink-0 ml-1"
            style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none", transition: "opacity 0.15s" }}
          >
            <button
              onClick={() => { setEditing(true); setEditValue(conversation.name); }}
              className="p-1 rounded"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--interactive)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              title="Rename"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              title="Delete"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CollectionItem ────────────────────────────────────────────────────────────

function CollectionItem({
  collection,
  isActive,
  onClick,
  onDelete,
}: {
  collection: Collection;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative rounded-lg"
      style={{
        backgroundColor: isActive ? "var(--interactive-light)" : "transparent",
        borderLeft: `2px solid ${isActive ? "var(--interactive)" : "transparent"}`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="flex items-center px-2.5 py-2 rounded-lg transition-colors"
        style={{ backgroundColor: hovered && !isActive ? "var(--bg-hover)" : "transparent" }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
          className="flex flex-col min-w-0 flex-1 cursor-pointer"
        >
          <span className="text-sm font-medium truncate" style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>
            {collection.name}
          </span>
          <span className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {collection.count.toLocaleString()} docs
          </span>
        </div>

        <div
          className="shrink-0 ml-1"
          style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none", transition: "opacity 0.15s" }}
        >
          <button
            onClick={onDelete}
            className="p-1 rounded"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            title="Delete collection"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
