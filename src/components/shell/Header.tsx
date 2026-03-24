"use client";

import { Settings, Plug, PlugZap } from "lucide-react";
import { motion } from "framer-motion";

interface HeaderProps {
  connected?: boolean;
  envReady?: boolean;
  onConnectionClick?: () => void;
  onSettingsClick?: () => void;
}

export function Header({ connected = false, envReady = false, onConnectionClick, onSettingsClick }: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex items-center justify-between h-14 px-4 border-b shrink-0"
      style={{
        backgroundColor: "#0d1220",
        borderColor: "#1e2d4a",
      }}
    >
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span
            className="text-xl font-bold leading-none"
            style={{ color: "#00c2cb" }}
          >
            ⬡
          </span>
          <div className="flex flex-col leading-none gap-0.5">
            <span
              className="text-[9px] font-bold uppercase tracking-widest"
              style={{ color: "#4589ff", fontFamily: "monospace" }}
            >
              IBM
            </span>
            <span
              className="text-base font-semibold tracking-tight leading-none"
              style={{ color: "#f8fafc" }}
            >
              Astra DB
            </span>
          </div>
        </div>

        {/* Divider */}
        <div
          className="h-5 w-px"
          style={{ backgroundColor: "#1e2d4a" }}
        />

        {/* Subtitle */}
        <span
          className="text-sm font-medium"
          style={{ color: "#64748b" }}
        >
          Data API Playground
        </span>
      </div>

      {/* Right: Status + Settings */}
      <div className="flex items-center gap-3">
        {/* Embedding model indicator */}
        <a
          href="https://huggingface.co/collections/ibm-granite/granite-embedding-models"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
          style={{
            backgroundColor: "rgba(15, 98, 254, 0.08)",
            border: "1px solid rgba(15, 98, 254, 0.2)",
            textDecoration: "none",
          }}
          title="Powered by IBM Granite models via HuggingFace & watsonx.ai"
        >
          <div className="flex flex-col gap-0 leading-none">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: "#4589ff", opacity: 0.7 }}>IBM Granite</span>
            <span className="text-[11px] font-semibold" style={{ color: "#4589ff" }}>
              Embed · 125M &nbsp;|&nbsp; Chat · 3-8B
            </span>
          </div>
          <motion.div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#4589ff" }} animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} />
        </a>
        {/* Connection Status — clickable */}
        <motion.button
          onClick={onConnectionClick}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: connected
              ? "rgba(0, 194, 203, 0.1)"
              : envReady
              ? "rgba(251, 191, 36, 0.12)"
              : "rgba(100, 116, 139, 0.1)",
            border: connected
              ? "1px solid rgba(0, 194, 203, 0.25)"
              : envReady
              ? "1px solid rgba(251, 191, 36, 0.4)"
              : "1px solid rgba(100, 116, 139, 0.25)",
            color: connected ? "#00c2cb" : envReady ? "#fbbf24" : "#64748b",
            cursor: "pointer",
            boxShadow: envReady && !connected ? "0 0 12px rgba(251,191,36,0.2)" : "none",
          }}
          whileHover={{ scale: 1.02, opacity: 0.85 }}
          whileTap={{ scale: 0.97 }}
          title={connected ? "Manage connection" : envReady ? "Env credentials detected — click to connect" : "Connect to Astra DB"}
        >
          {connected ? (
            <PlugZap size={12} className="shrink-0" />
          ) : (
            <Plug size={12} className="shrink-0" />
          )}
          <motion.span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: connected ? "#00c2cb" : envReady ? "#fbbf24" : "#64748b" }}
            animate={connected || envReady ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          {connected ? "Connected" : envReady ? "Env Ready" : "Disconnected"}
        </motion.button>

        {/* Settings */}
        <motion.button
          onClick={onSettingsClick}
          className="p-2 rounded-lg transition-colors"
          style={{ color: "#64748b" }}
          whileHover={{ backgroundColor: "rgba(30, 45, 74, 0.8)", color: "#f8fafc", scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Quick Start & Settings"
        >
          <Settings size={16} />
        </motion.button>
      </div>
    </motion.header>
  );
}
