"use client";

import { Settings, Plug, PlugZap, LogOut, Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";

interface HeaderProps {
  connected?: boolean;
  envReady?: boolean;
  onConnectionClick?: () => void;
  onSettingsClick?: () => void;
  authEnabled?: boolean;
  onSignOut?: () => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
}

export function Header({
  connected = false,
  envReady = false,
  onConnectionClick,
  onSettingsClick,
  authEnabled = false,
  onSignOut,
  theme = "dark",
  onToggleTheme,
}: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex items-center justify-between h-14 px-4 border-b shrink-0"
      style={{
        backgroundColor: "var(--bg-panel)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          {/* Hex logo mark */}
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold leading-none select-none"
            style={{
              backgroundColor: "var(--interactive-light)",
              border: "1px solid var(--interactive-border)",
              color: "var(--interactive)",
            }}
          >
            ⬡
          </div>
          <div className="flex flex-col leading-none gap-0.5">
            <span
              className="text-[9px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}
            >
              DataStax
            </span>
            <span
              className="text-sm font-semibold tracking-tight leading-none"
              style={{ color: "var(--text-primary)" }}
            >
              Astra DB
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-5 w-px" style={{ backgroundColor: "var(--border-subtle)" }} />

        <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
          Data API Playground
        </span>
      </div>

      {/* Right: indicators + controls */}
      <div className="flex items-center gap-2">
        {/* IBM Granite badge */}
        <a
          href="https://huggingface.co/collections/ibm-granite/granite-embedding-models"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-opacity hover:opacity-75"
          style={{
            backgroundColor: "var(--interactive-light)",
            border: "1px solid var(--interactive-border)",
            textDecoration: "none",
          }}
          title="Powered by IBM Granite models via HuggingFace & watsonx.ai"
        >
          <div className="flex flex-col gap-0 leading-none">
            <span
              className="text-[9px] uppercase tracking-wider"
              style={{ color: "var(--interactive)", opacity: 0.7, fontFamily: "IBM Plex Mono, monospace" }}
            >
              IBM Granite
            </span>
            <span className="text-[11px] font-semibold" style={{ color: "var(--interactive)", fontFamily: "IBM Plex Mono, monospace" }}>
              Embed · 125M &nbsp;|&nbsp; Chat · 3-8B
            </span>
          </div>
          <motion.div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: "var(--interactive)" }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </a>

        {/* Connection status / disconnect */}
        {connected ? (
          <motion.button
            onClick={onConnectionClick}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.3)",
              color: "#22c55e",
              cursor: "pointer",
            }}
            whileHover={{ backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.35)", color: "#ef4444", scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            title="Disconnect and return to demo mode"
          >
            <motion.span className="shrink-0" style={{ display: "flex" }}>
              <PlugZap size={12} className="group-hover:hidden" />
              <LogOut size={12} className="hidden group-hover:block" />
            </motion.span>
            <motion.span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: "#22c55e" }}
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="group-hover:hidden">Connected</span>
            <span className="hidden group-hover:inline">Disconnect</span>
          </motion.button>
        ) : (
          <motion.button
            onClick={onConnectionClick}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: envReady ? "rgba(251,191,36,0.1)" : "var(--bg-card)",
              border: envReady ? "1px solid rgba(251,191,36,0.35)" : "1px solid var(--border-subtle)",
              color: envReady ? "#fbbf24" : "var(--text-muted)",
              cursor: "pointer",
            }}
            whileHover={{ scale: 1.02, opacity: 0.85 }}
            whileTap={{ scale: 0.97 }}
            title={envReady ? "Env credentials detected — click to connect" : "Connect to Astra DB"}
          >
            <Plug size={12} className="shrink-0" />
            <motion.span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: envReady ? "#fbbf24" : "var(--text-muted)" }}
              animate={envReady ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            {envReady ? "Env Ready" : "Connect to Astra DB"}
          </motion.button>
        )}

        {/* Theme toggle */}
        <motion.button
          onClick={onToggleTheme}
          className="p-2 rounded-lg"
          style={{ color: "var(--text-muted)", backgroundColor: "rgba(0,0,0,0)" }}
          whileHover={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)", scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </motion.button>

        {authEnabled && (
          <motion.button
            onClick={onSignOut}
            className="p-2 rounded-lg"
            style={{ color: "var(--text-muted)", backgroundColor: "rgba(0,0,0,0)" }}
            whileHover={{ backgroundColor: "var(--bg-hover)", color: "#ef4444", scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Sign out"
          >
            <LogOut size={15} />
          </motion.button>
        )}

        {/* Settings */}
        <motion.button
          onClick={onSettingsClick}
          className="p-2 rounded-lg"
          style={{ color: "var(--text-muted)", backgroundColor: "rgba(0,0,0,0)" }}
          whileHover={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)", scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Quick Start & Settings"
        >
          <Settings size={15} />
        </motion.button>
      </div>
    </motion.header>
  );
}
