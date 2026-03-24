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

  // Reset input whenever a new collection is targeted
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
          style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            key="delete-collection-panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#0d1220", border: "1px solid #1e2d4a", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: "#1e2d4a", backgroundColor: "rgba(239,68,68,0.05)" }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}
                >
                  <Trash2 size={15} style={{ color: "#ef4444" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "#f8fafc" }}>
                  Delete Collection
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg transition-colors"
                style={{ color: "#475569" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#475569"; }}
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
                  <p style={{ color: "#94a3b8" }}>
                    All documents in{" "}
                    <span className="font-mono font-semibold" style={{ color: "#fca5a5" }}>
                      {collectionName}
                    </span>{" "}
                    will be permanently deleted from Astra DB.
                  </p>
                </div>
              </div>

              {/* SDK code snippet */}
              <div
                className="rounded-lg overflow-hidden"
                style={{ backgroundColor: "rgba(11,15,26,0.7)", border: "1px solid #1e2d4a" }}
              >
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#334155" }}>
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
                          color: sdkLang === lang ? "#ef4444" : "#475569",
                          border: sdkLang === lang ? "1px solid rgba(239,68,68,0.3)" : "1px solid transparent",
                        }}
                      >
                        {{ ts: "TS", python: "Py", java: "Java" }[lang]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-3 pb-2.5">
                  <code
                    className="text-[11px]"
                    style={{ fontFamily: "JetBrains Mono, monospace", color: "#94a3b8" }}
                  >
                    <span style={{ color: "#ef4444" }}>db</span>
                    <span style={{ color: "#94a3b8" }}>
                      {sdkLang === "ts" && `.dropCollection(`}
                      {sdkLang === "python" && `.drop_collection(`}
                      {sdkLang === "java" && `.dropCollection(`}
                    </span>
                    <span style={{ color: "#4ade80" }}>&quot;{collectionName}&quot;</span>
                    <span style={{ color: "#94a3b8" }}>)</span>
                    {(sdkLang === "ts" || sdkLang === "java") && <span style={{ color: "#94a3b8" }}>;</span>}
                  </code>
                </div>
              </div>

              {/* Confirmation input */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium" style={{ color: "#94a3b8" }}>
                  Type{" "}
                  <span className="font-mono font-semibold px-1 py-0.5 rounded" style={{ color: "#f8fafc", backgroundColor: "#13192b", border: "1px solid #1e2d4a" }}>
                    {collectionName}
                  </span>{" "}
                  to confirm
                </label>
                <input
                  autoFocus
                  value={confirmValue}
                  onChange={(e) => setConfirmValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && matches) handleConfirm(); if (e.key === "Escape") onClose(); }}
                  placeholder={collectionName ?? ""}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none font-mono"
                  style={{
                    backgroundColor: "#13192b",
                    border: `1px solid ${confirmValue === "" ? "#1e2d4a" : matches ? "rgba(74,222,128,0.5)" : "rgba(239,68,68,0.4)"}`,
                    color: "#f8fafc",
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
              style={{ borderColor: "#1e2d4a", backgroundColor: "rgba(11,15,26,0.5)" }}
            >
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: "#64748b", backgroundColor: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(30,45,74,0.6)"; (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "#64748b"; }}
              >
                Cancel
              </button>
              <motion.button
                onClick={handleConfirm}
                disabled={!matches}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{
                  backgroundColor: matches ? "#ef4444" : "#1e2d4a",
                  color: matches ? "#fff" : "#475569",
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
