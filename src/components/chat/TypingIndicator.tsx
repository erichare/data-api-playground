"use client";

import { motion } from "framer-motion";

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex items-start gap-3 max-w-lg"
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
        style={{
          background: "linear-gradient(135deg, #6c63ff, #00c2cb)",
          color: "#f8fafc",
        }}
      >
        AI
      </div>

      {/* Bubble */}
      <div
        className="px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{
          backgroundColor: "#13192b",
          border: "1px solid #1e2d4a",
        }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full typing-dot"
            style={{ backgroundColor: "#00c2cb" }}
          />
          <span
            className="w-2 h-2 rounded-full typing-dot"
            style={{ backgroundColor: "#00c2cb" }}
          />
          <span
            className="w-2 h-2 rounded-full typing-dot"
            style={{ backgroundColor: "#00c2cb" }}
          />
        </div>
      </div>
    </motion.div>
  );
}
