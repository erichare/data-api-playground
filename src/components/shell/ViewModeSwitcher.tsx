"use client";

import { motion } from "framer-motion";
import { MessageSquare, Terminal, Upload } from "lucide-react";
import type { ViewMode } from "@/lib/types";

interface ViewModeSwitcherProps {
  viewMode: ViewMode;
  activeCollection?: string;
  showApiMode?: boolean;
  onChange: (mode: ViewMode) => void;
}

export function ViewModeSwitcher({
  viewMode,
  activeCollection,
  showApiMode = true,
  onChange,
}: ViewModeSwitcherProps) {
  return (
    <div
      className="shrink-0 flex items-center px-4 border-b"
      style={{
        backgroundColor: "var(--bg-panel)",
        borderColor: "var(--border-subtle)",
        minHeight: "44px",
      }}
    >
      <div
        className="flex rounded-lg p-0.5 gap-0.5"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <ModeButton
          mode="chat"
          activeMode={viewMode}
          label="Chat"
          icon={<MessageSquare size={12} />}
          onClick={onChange}
        />
        <ModeButton
          mode="ingest"
          activeMode={viewMode}
          label="Ingest"
          icon={<Upload size={12} />}
          onClick={onChange}
        />
        {showApiMode && (
          <ModeButton
            mode="api"
            activeMode={viewMode}
            label="API"
            icon={<Terminal size={12} />}
            onClick={onChange}
          />
        )}
      </div>

      {showApiMode && viewMode === "api" && activeCollection && (
        <motion.span
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          className="ml-3 text-xs"
          style={{
            color: "var(--text-muted)",
            fontFamily: "IBM Plex Mono, monospace",
          }}
        >
          {activeCollection}
        </motion.span>
      )}
    </div>
  );
}

function ModeButton({
  mode,
  activeMode,
  label,
  icon,
  onClick,
}: {
  mode: ViewMode;
  activeMode: ViewMode;
  label: string;
  icon: React.ReactNode;
  onClick: (mode: ViewMode) => void;
}) {
  const isActive = activeMode === mode;
  const isApi = mode === "api";

  return (
    <motion.button
      onClick={() => onClick(mode)}
      data-testid={`view-mode-${mode}-button`}
      className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium"
      style={{
        backgroundColor: isActive
          ? isApi
            ? "var(--interactive-light)"
            : "var(--bg-panel)"
          : "transparent",
        color: isActive
          ? isApi
            ? "var(--interactive)"
            : "var(--text-primary)"
          : "var(--text-muted)",
        boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
      }}
      whileTap={{ scale: 0.97 }}
    >
      {icon}
      {label}
    </motion.button>
  );
}
