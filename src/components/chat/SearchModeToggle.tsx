"use client";

import { motion } from "framer-motion";
import type { SearchMode } from "@/lib/types";

const modes: { value: SearchMode; label: string; description: string }[] = [
  { value: "vector", label: "Vector", description: "Dense embedding search" },
  { value: "hybrid", label: "Hybrid", description: "Vector + keyword" },
  { value: "lexical", label: "Lexical", description: "BM25 full-text" },
];

interface SearchModeToggleProps {
  value: SearchMode;
  onChange: (mode: SearchMode) => void;
  availableModes?: SearchMode[];
}

export function SearchModeToggle({
  value,
  onChange,
  availableModes = ["vector", "hybrid", "lexical"],
}: SearchModeToggleProps) {
  return (
    <div
      className="flex items-center rounded-full p-0.5 relative"
      style={{
        backgroundColor: "var(--bg-primary)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {modes.map((mode) => {
        const isActive = value === mode.value;
        const isAvailable = availableModes.includes(mode.value);
        return (
          <motion.button
            key={mode.value}
            onClick={() => {
              if (isAvailable) {
                onChange(mode.value);
              }
            }}
            disabled={!isAvailable}
            className="relative px-3 py-1 rounded-full text-xs font-medium z-10 transition-colors"
            style={{
              color: isActive ? "#fff" : isAvailable ? "var(--text-muted)" : "var(--text-muted)",
              opacity: isAvailable ? 1 : 0.45,
              cursor: isAvailable ? "pointer" : "not-allowed",
            }}
            whileHover={{ color: isActive ? "#fff" : "var(--text-secondary)" }}
            title={mode.description}
          >
            {isActive && (
              <motion.span
                layoutId="search-mode-pill"
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: "var(--interactive)" }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <span className="relative z-10">{mode.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
