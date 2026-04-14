/**
 * Lightweight syntax-highlighting components for search code previews.
 *
 * Each `render*Code` function splits a code string by language-specific
 * tokens and wraps them in coloured spans using CSS variables from the
 * playground theme.  No external highlighting library is required.
 */

// ── Token helpers ────────────────────────────────────────────────────────────

export function Kw({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--interactive)" }}>{children}</span>;
}

export function Str({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--step-respond)" }}>{children}</span>;
}

export function Key({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--step-embed)" }}>{children}</span>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--text-muted)" }}>{children}</span>;
}

// ── Language renderers ───────────────────────────────────────────────────────

export function renderTsCode(code: string) {
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {line
        .replace(/^(await )/, "⟨await⟩")
        .split(/(⟨await⟩|"[^"]*"|\$[a-zA-Z]+|\.find(?:AndRerank)?|\b(?:db|collection)\b)/g)
        .map((part, j) => {
          if (part === "⟨await⟩") return <Kw key={j}>await </Kw>;
          if (part.startsWith('"')) return <Str key={j}>{part}</Str>;
          if (part.startsWith("$")) return <Key key={j}>{part}</Key>;
          if (part === ".find" || part === ".findAndRerank") return <Kw key={j}>{part}</Kw>;
          if (part === "db" || part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {"\n"}
    </span>
  ));
}

export function renderPythonCode(code: string) {
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {line
        .split(/(from\s+\w+|import\s+\w+|"[^"]*"|'\$[^']*'|\$\w+|\b(?:collection|SortDocuments)\b)/g)
        .map((part, j) => {
          if (part.startsWith("from ") || part.startsWith("import ")) return <Kw key={j}>{part}</Kw>;
          if (part.startsWith('"') || part.startsWith("'")) return <Str key={j}>{part}</Str>;
          if (part.startsWith("$")) return <Key key={j}>{part}</Key>;
          if (part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {"\n"}
    </span>
  ));
}

export function renderJavaCode(code: string) {
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {line
        .split(/(new\s+\w+|Filter\.empty\(\)|Sorts\.\w+|"[^"]*"|\b(?:collection)\b)/g)
        .map((part, j) => {
          if (part.startsWith("new ")) return <Kw key={j}>{part}</Kw>;
          if (part === "Filter.empty()") return <Muted key={j}>{part}</Muted>;
          if (part.startsWith("Sorts.")) return <Key key={j}>{part}</Key>;
          if (part.startsWith('"')) return <Str key={j}>{part}</Str>;
          if (part === "collection") return <span key={j} style={{ color: "var(--text-primary)" }}>{part}</span>;
          return <span key={j}>{part}</span>;
        })}
      {"\n"}
    </span>
  ));
}

export function renderCurlCode(code: string) {
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {line
        .split(/(curl|-[XH]|"[^"]*"|\$[A-Z_]+|'[\s\S]*')/g)
        .map((part, j) => {
          if (part === "curl") return <Kw key={j}>{part}</Kw>;
          if (part === "-X" || part === "-H") return <Muted key={j}>{part}</Muted>;
          if (part.startsWith('"')) return <Str key={j}>{part}</Str>;
          if (part.startsWith("$")) return <Key key={j}>{part}</Key>;
          return <span key={j}>{part}</span>;
        })}
      {"\n"}
    </span>
  ));
}
