"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { Collection } from "@/lib/types";

export interface CollectionItemProps {
  collection: Collection;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function CollectionItem({
  collection,
  isActive,
  onClick,
  onDelete,
}: CollectionItemProps) {
  const [hovered, setHovered] = useState(false);
  const countParts = collection.creating
    ? []
    : [
        typeof collection.documentCount === "number"
          ? `${collection.documentCount.toLocaleString()} docs`
          : null,
        typeof collection.count === "number"
          ? `${collection.count.toLocaleString()} chunks`
          : null,
      ].filter((part): part is string => part !== null);
  const countLabel = collection.creating
    ? "Creating collection..."
    : countParts.length > 0
      ? countParts.join(", ")
      : "Count not sampled";

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
      <div className="flex items-center px-2.5 py-2 rounded-lg">
        <div
          role="button"
          tabIndex={collection.creating ? -1 : 0}
          onClick={() => {
            if (collection.creating) return;
            onClick();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !collection.creating) onClick();
          }}
          className="flex flex-col min-w-0 flex-1"
          style={{ cursor: collection.creating ? "default" : "pointer" }}
        >
          <span className="text-sm font-medium truncate" style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>
            {collection.name}
          </span>
          <span className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {countLabel}
          </span>
        </div>

        {collection.creating ? (
          <div
            className="flex items-center shrink-0 ml-1"
            style={{ color: "var(--text-muted)" }}
          >
            <Loader2 size={11} className="animate-spin" />
          </div>
        ) : (
          <div
            className="flex items-center gap-0.5 shrink-0 ml-1"
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
        )}
      </div>
    </div>
  );
}
