"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, TriangleAlert, X } from "lucide-react";

const SDK_LANGS = ["ts", "python", "java"] as const;
type SdkLang = typeof SDK_LANGS[number];


interface DeleteCollectionDialogProps {
  collectionName: string | null;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

export function DeleteCollectionDialog({
  collectionName,
  onClose,
  onConfirm,
}: DeleteCollectionDialogProps) {
  const [confirmValue, setConfirmValue] = useState("");
  const [sdkLang, setSdkLang] = useState<SdkLang>("ts");
  const open = !!collectionName;
  const matches = confirmValue === collectionName;

  useEffect(() => {
    if (open) setConfirmValue("");
  }, [collectionName, open]);

  const handleConfirm = () => {
    if (!matches || !collectionName) return;
    onConfirm(collectionName);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="delete-collection-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            key="delete-collection-panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--bg-panel)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "rgba(239,68,68,0.04)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}
                >
                  <Trash2 size={15} style={{ color: "#ef4444" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Delete Collection
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg transition-colors"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 flex flex-col gap-4">
              {/* Warning banner */}
              <div
                className="flex items-start gap-3 px-4 py-3 rounded-xl"
                style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
              >
                <TriangleAlert size={16} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
                <div className="text-sm leading-relaxed" style={{ color: "#fca5a5" }}>
                  <p className="font-semibold mb-0.5">This action cannot be undone.</p>
                  <p style={{ color: "var(--text-secondary)" }}>
                    All documents in{" "}
                    <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#fca5a5" }}>
                      {collectionName}
                    </span>{" "}
                    will be permanently deleted from Astra DB.
                  </p>
                </div>
              </div>

              {/* SDK code snippet */}
              <div
                className="rounded-lg overflow-hidden"
                style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-subtle)" }}
              >
                <div
                  className="flex items-center justify-between px-3 pt-2 pb-1 border-b"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <span
                    className="text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--text-muted)" }}
                  >
                    SDK equivalent
                  </span>
                  <div className="flex gap-0.5">
                    {SDK_LANGS.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setSdkLang(lang)}
                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                        style={{
                          backgroundColor: sdkLang === lang ? "rgba(239,68,68,0.15)" : "transparent",
                          color: sdkLang === lang ? "#ef4444" : "var(--text-muted)",
                          border: sdkLang === lang ? "1px solid rgba(239,68,68,0.3)" : "1px solid transparent",
                        }}
                      >
                        {{ ts: "TS", python: "Py", java: "Java" }[lang]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-3 py-2.5">
                  <code
                    className="text-[11px]"
                    style={{ fontFamily: "IBM Plex Mono, monospace", color: "var(--text-secondary)" }}
                  >
                    <span style={{ color: "#ef4444" }}>db</span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {sdkLang === "ts" && `.dropCollection(`}
                      {sdkLang === "python" && `.drop_collection(`}
                      {sdkLang === "java" && `.dropCollection(`}
                    </span>
                    <span style={{ color: "#4ade80" }}>&quot;{collectionName}&quot;</span>
                    <span style={{ color: "var(--text-secondary)" }}>)</span>
                    {(sdkLang === "ts" || sdkLang === "java") && (
                      <span style={{ color: "var(--text-secondary)" }}>;</span>
                    )}
                  </code>
                </div>
              </div>

              {/* Confirmation input */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Type{" "}
                  <span
                    style={{
                      fontFamily: "IBM Plex Mono, monospace",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      backgroundColor: "var(--bg-input)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "4px",
                      padding: "1px 5px",
                    }}
                  >
                    {collectionName}
                  </span>{" "}
                  to confirm
                </label>
                <input
                  autoFocus
                  value={confirmValue}
                  onChange={(e) => setConfirmValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && matches) handleConfirm();
                    if (e.key === "Escape") onClose();
                  }}
                  placeholder={collectionName ?? ""}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    backgroundColor: "var(--bg-input)",
                    border: `1px solid ${
                      confirmValue === ""
                        ? "var(--border-subtle)"
                        : matches
                        ? "rgba(74,222,128,0.5)"
                        : "rgba(239,68,68,0.4)"
                    }`,
                    color: "var(--text-primary)",
                    transition: "border-color 0.15s",
                  }}
                />
                {confirmValue.length > 0 && !matches && (
                  <p className="text-[11px]" style={{ color: "#ef4444" }}>
                    Name doesn&apos;t match — check spelling and capitalization
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-end gap-2 px-5 py-4 border-t"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-card)" }}
            >
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: "var(--text-muted)", backgroundColor: "transparent" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover)";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                }}
              >
                Cancel
              </button>
              <motion.button
                onClick={handleConfirm}
                disabled={!matches}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{
                  backgroundColor: matches ? "#ef4444" : "var(--bg-hover)",
                  color: matches ? "#fff" : "var(--text-muted)",
                  boxShadow: matches ? "0 2px 12px rgba(239,68,68,0.35)" : "none",
                  cursor: matches ? "pointer" : "not-allowed",
                  transition: "all 0.15s",
                }}
                whileHover={matches ? { scale: 1.03 } : {}}
                whileTap={matches ? { scale: 0.97 } : {}}
              >
                <Trash2 size={13} />
                Delete Collection
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
