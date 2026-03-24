"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { DocumentSource } from "@/lib/types";

function getSimilarityColor(score: number): string {
  if (score >= 0.9) return "#10b981"; // green
  if (score >= 0.7) return "#f59e0b"; // yellow
  return "#ff6b35"; // orange
}

interface SourceCardProps {
  source: DocumentSource;
  index: number;
}

export function SourceCard({ source, index }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const color = getSimilarityColor(source.similarity);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.07 }}
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: "rgba(30, 45, 74, 0.35)",
        border: "1px solid #1e2d4a",
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left group"
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Collection badge */}
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: "rgba(108, 99, 255, 0.12)",
              color: "#6c63ff",
            }}
          >
            {source.collection}
          </span>
          {/* Doc ID */}
          <span
            className="text-[11px] truncate"
            style={{ color: "#64748b", fontFamily: "JetBrains Mono, monospace" }}
          >
            {source.id}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {/* Similarity score */}
          <div className="flex items-center gap-1">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span
              className="text-[11px] font-semibold"
              style={{ color }}
            >
              {source.similarity.toFixed(2)}
            </span>
          </div>

          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown
              size={12}
              style={{ color: "#64748b" }}
            />
          </motion.div>
        </div>
      </button>

      {/* Expandable JSON preview */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              className="px-3 pb-3 pt-1"
              style={{ borderTop: "1px solid #1e2d4a" }}
            >
              <p
                className="text-[10px] font-medium uppercase tracking-wider mb-1.5"
                style={{ color: "#64748b" }}
              >
                Document Preview
              </p>
              <pre
                className="text-[11px] leading-relaxed rounded-md p-2 overflow-x-auto"
                style={{
                  backgroundColor: "rgba(11, 15, 26, 0.6)",
                  color: "#7dd3fc",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {JSON.stringify(source.preview, null, 2)}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
