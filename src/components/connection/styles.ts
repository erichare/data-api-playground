import type { CSSProperties } from "react";

export const labelStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  marginBottom: "6px",
  display: "block",
};

export const inputStyle: CSSProperties = {
  backgroundColor: "var(--bg-input)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "13px",
  width: "100%",
  outline: "none",
  fontFamily: "IBM Plex Mono, monospace",
};
