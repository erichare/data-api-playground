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
}

export function SearchModeToggle({ value, onChange }: SearchModeToggleProps) {
  return (
    <div
      className="flex items-center rounded-full p-0.5 relative"
      style={{
        backgroundColor: "#13192b",
        border: "1px solid #1e2d4a",
      }}
    >
      {modes.map((mode) => {
        const isActive = value === mode.value;
        return (
          <motion.button
            key={mode.value}
            onClick={() => onChange(mode.value)}
            className="relative px-3 py-1 rounded-full text-xs font-medium z-10 transition-colors"
            style={{
              color: isActive ? "#f8fafc" : "#64748b",
            }}
            whileHover={{ color: isActive ? "#f8fafc" : "#94a3b8" }}
            title={mode.description}
          >
            {isActive && (
              <motion.span
                layoutId="search-mode-pill"
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: "#ff6b35" }}
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
