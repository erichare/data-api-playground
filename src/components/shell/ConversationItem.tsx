"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import type { Conversation } from "@/lib/types";

export interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function ConversationItem({
  conversation,
  isActive,
  onClick,
  onRename,
  onDelete,
}: ConversationItemProps) {
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
        backgroundColor: isActive ? "var(--interactive-light)" : "rgba(0,0,0,0)",
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
