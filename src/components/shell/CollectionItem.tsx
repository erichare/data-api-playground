"use client";

import { useState } from "react";
import type { Collection } from "@/lib/types";

export interface CollectionItemProps {
  collection: Collection;
  isActive: boolean;
  onClick: () => void;
}

export function CollectionItem({
  collection,
  isActive,
  onClick,
}: CollectionItemProps) {
  const [hovered, setHovered] = useState(false);
  const countParts = [
    typeof collection.documentCount === "number"
      ? `${collection.documentCount.toLocaleString()} docs`
      : null,
    typeof collection.count === "number"
      ? `${collection.count.toLocaleString()} chunks`
      : null,
  ].filter((part): part is string => part !== null);
  const countLabel = countParts.length > 0 ? countParts.join(", ") : "Count not sampled";

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
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
        className="flex flex-col px-2.5 py-2 rounded-lg transition-colors cursor-pointer"
        style={{ backgroundColor: hovered && !isActive ? "var(--bg-hover)" : "transparent" }}
      >
        <span className="text-sm font-medium truncate" style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>
          {collection.name}
        </span>
        <span className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          {countLabel}
        </span>
      </div>
    </div>
  );
}
