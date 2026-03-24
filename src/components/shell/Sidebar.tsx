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
  Table2,
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
  // Conversations
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
  const [showKsDropdown, setShowKsDropdown] = useState(false);
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
      style={{ backgroundColor: "#0d1220", borderColor: "#1e2d4a" }}
    >
      {/* Collapse toggle */}
      <div className="shrink-0 border-b flex" style={{ borderColor: "#1e2d4a" }}>
        <motion.button
          onClick={() => setCollapsed(!collapsed)}
          className="flex-1 flex items-center gap-2 px-3 py-2.5 text-xs font-medium"
          style={{ color: "#475569" }}
          whileHover={{ backgroundColor: "rgba(30,45,74,0.6)", color: "#94a3b8" }}
          whileTap={{ scale: 0.97 }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          {!collapsed && <span>Collapse</span>}
        </motion.button>
      </div>

      {!collapsed && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

          {/* Mode toggle: Chat / Browse */}
          <div className="px-3 pt-3 pb-2 shrink-0">
            <div
              className="flex rounded-lg p-0.5 gap-0.5"
              style={{ backgroundColor: "#13192b", border: "1px solid #1e2d4a" }}
            >
              <motion.button
                onClick={onSelectChat}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: viewMode === "chat" ? "#1e2d4a" : "transparent",
                  color: viewMode === "chat" ? "#f8fafc" : "#64748b",
                }}
                whileTap={{ scale: 0.97 }}
              >
                <MessageSquare size={11} />
                Chat
              </motion.button>
              <motion.button
                onClick={() => onSelectCollection(activeCollection)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: viewMode === "browse" ? "rgba(255,107,53,0.15)" : "transparent",
                  color: viewMode === "browse" ? "#ff6b35" : "#64748b",
                }}
                whileTap={{ scale: 0.97 }}
              >
                <Table2 size={11} />
                Browse
              </motion.button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">

            {/* ── Conversations ── */}
            <div className="px-3 pt-1 pb-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#64748b" }}>
                  Conversations
                </p>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "rgba(0,194,203,0.12)", color: "#00c2cb" }}
                  >
                    {conversations.length}
                  </span>
                  <motion.button
                    onClick={() => void onNewConversation()}
                    disabled={creatingConversation}
                    className="w-5 h-5 rounded flex items-center justify-center"
                    style={{ color: creatingConversation ? "#00c2cb" : "#475569", cursor: creatingConversation ? "default" : "pointer" }}
                    whileHover={creatingConversation ? {} : { backgroundColor: "rgba(0,194,203,0.12)", color: "#00c2cb" }}
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
            <div className="mx-3 my-1 h-px shrink-0" style={{ backgroundColor: "#1e2d4a" }} />

            {/* ── Keyspace ── */}
            <div className="px-3 pt-1 pb-2 relative shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "#64748b" }}>
                Keyspace
              </p>
              <button
                onClick={() => keyspaces.length > 1 && setShowKsDropdown(!showKsDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium"
                style={{
                  backgroundColor: "#13192b",
                  border: "1px solid #1e2d4a",
                  color: "#f8fafc",
                  cursor: keyspaces.length > 1 ? "pointer" : "default",
                }}
              >
                <div className="flex items-center gap-2">
                  <Database size={13} style={{ color: "#00c2cb" }} />
                  <span className="truncate">{selectedKeyspace}</span>
                </div>
                {keyspaces.length > 1 && <ChevronDown size={13} style={{ color: "#64748b" }} />}
              </button>

              <AnimatePresence>
                {showKsDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-3 right-3 mt-1 rounded-lg overflow-hidden z-50 shadow-xl"
                    style={{ backgroundColor: "#13192b", border: "1px solid #1e2d4a" }}
                  >
                    {keyspaces.map((ks) => (
                      <button
                        key={ks}
                        onClick={() => { setShowKsDropdown(false); onKeyspaceChange?.(ks); }}
                        className="w-full px-3 py-2 text-left text-sm flex items-center gap-2"
                        style={{
                          backgroundColor: ks === selectedKeyspace ? "rgba(0,194,203,0.08)" : "transparent",
                          color: ks === selectedKeyspace ? "#00c2cb" : "#94a3b8",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(30,45,74,0.6)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ks === selectedKeyspace ? "rgba(0,194,203,0.08)" : "transparent"; }}
                      >
                        <Database size={11} style={{ color: ks === selectedKeyspace ? "#00c2cb" : "#64748b" }} />
                        {ks}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Divider */}
            <div className="mx-3 my-1 h-px shrink-0" style={{ backgroundColor: "#1e2d4a" }} />

            {/* ── Collections ── */}
            <div className="px-3 pt-1 pb-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#64748b" }}>
                  Collections
                </p>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "rgba(108,99,255,0.15)", color: "#6c63ff" }}
                  >
                    {visibleCollections.length}
                  </span>
                  <button
                    onClick={() => setShowInternal((v) => !v)}
                    className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{
                      color: showInternal ? "#6c63ff" : "#475569",
                      backgroundColor: showInternal ? "rgba(108,99,255,0.12)" : "transparent",
                      border: `1px solid ${showInternal ? "rgba(108,99,255,0.3)" : "transparent"}`,
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
            <div className="h-px mb-3" style={{ backgroundColor: "#1e2d4a" }} />
            <motion.button
              onClick={onNewCollection}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ color: "#64748b", border: "1px dashed #1e2d4a" }}
              whileHover={{ backgroundColor: "rgba(255,107,53,0.05)", borderColor: "rgba(255,107,53,0.4)", color: "#ff6b35" }}
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
                backgroundColor: conv.id === activeConversationId ? "rgba(0,194,203,0.15)" : "transparent",
                color: conv.id === activeConversationId ? "#00c2cb" : "#64748b",
                borderLeft: conv.id === activeConversationId ? "2px solid #00c2cb" : "2px solid transparent",
              }}
              whileHover={{ backgroundColor: "rgba(0,194,203,0.1)" }}
              title={conv.name}
            >
              <MessageSquare size={13} />
            </motion.button>
          ))}
          <div className="w-4 h-px my-1" style={{ backgroundColor: "#1e2d4a" }} />
          {collections.map((col) => (
            <motion.button
              key={col.name}
              onClick={() => onSelectCollection(col.name)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold uppercase"
              style={{
                backgroundColor: activeCollection === col.name ? "rgba(255,107,53,0.15)" : "transparent",
                color: activeCollection === col.name ? "#ff6b35" : "#64748b",
                borderLeft: activeCollection === col.name ? "2px solid #ff6b35" : "2px solid transparent",
              }}
              whileHover={{ backgroundColor: "rgba(255,107,53,0.1)" }}
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
        backgroundColor: isActive ? "rgba(0,194,203,0.06)" : "transparent",
        borderLeft: `2px solid ${isActive ? "#00c2cb" : "transparent"}`,
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
            style={{ color: "#f8fafc", borderBottom: "1px solid #00c2cb" }}
          />
          <button onClick={commitRename} className="p-0.5 rounded" style={{ color: "#4ade80" }}>
            <Check size={11} />
          </button>
          <button onClick={cancelRename} className="p-0.5 rounded" style={{ color: "#64748b" }}>
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
            <span className="text-xs font-medium truncate" style={{ color: isActive ? "#f8fafc" : "#94a3b8" }}>
              {conversation.name}
            </span>
            {count > 0 && (
              <span className="text-[10px]" style={{ color: "#475569" }}>
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
              style={{ color: "#475569" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#00c2cb"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#475569"; }}
              title="Rename"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded"
              style={{ color: "#475569" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#475569"; }}
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
        backgroundColor: isActive ? "rgba(255,107,53,0.08)" : "transparent",
        borderLeft: `2px solid ${isActive ? "#ff6b35" : "transparent"}`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="flex items-center px-2.5 py-2 rounded-lg transition-colors"
        style={{ backgroundColor: hovered && !isActive ? "rgba(30,45,74,0.6)" : "transparent" }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
          className="flex flex-col min-w-0 flex-1 cursor-pointer"
        >
          <span className="text-sm font-medium truncate" style={{ color: isActive ? "#f8fafc" : "#94a3b8" }}>
            {collection.name}
          </span>
          <span className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
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
            style={{ color: "#475569" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#475569"; }}
            title="Delete collection"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
