"use client";
/* eslint-disable security/detect-unsafe-regex -- This static JSON-highlighting regex is bounded and not constructed from user input. */

import { type ReactNode, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { CodeLang } from "./apiExplorerConfig";

export function HighlightedJson({ json }: { json: string }) {
  const parts: ReactNode[] = [];
  const regex =
    /("(?:[^"\\]|\\.)*")\s*:?|-?\d+\.?\d*(?:[eE][+-]?\d+)?|true|false|null/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(json)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++} style={{ color: "var(--text-muted)" }}>
          {json.slice(lastIndex, match.index)}
        </span>
      );
    }

    const token = match[0];
    const isKey =
      token.startsWith('"') &&
      json[match.index + token.length]?.trimStart()[0] === ":";
    let color = "var(--text-secondary)";
    if (isKey) {
      color = "var(--step-embed)";
    } else if (token.startsWith('"')) {
      color = "var(--step-respond)";
    } else if (token === "true" || token === "false" || token === "null") {
      color = "var(--interactive)";
    } else if (/^-?\d/.test(token)) {
      color = "var(--step-search)";
    }

    parts.push(
      <span key={key++} style={{ color }}>
        {token}
      </span>
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < json.length) {
    parts.push(
      <span key={key++} style={{ color: "var(--text-muted)" }}>
        {json.slice(lastIndex)}
      </span>
    );
  }

  return <>{parts}</>;
}

const TS_KEYWORDS = new Set([
  "import",
  "from",
  "const",
  "await",
  "new",
  "async",
  "export",
  "return",
]);

const PYTHON_KEYWORDS = new Set([
  "from",
  "import",
  "list",
  "os",
  "def",
  "return",
  "True",
  "False",
  "None",
]);

const JAVA_KEYWORDS = new Set([
  "new",
  "List",
  "Optional",
  "long",
  "System",
  "String",
  "class",
  "void",
  "return",
]);

export function HighlightedCode({
  code,
  lang,
}: {
  code: string;
  lang: CodeLang;
}) {
  if (lang === "curl") {
    const parts: ReactNode[] = [];
    const regex = /\$[A-Z_]+|"[^"]*"|-[sXHd](?=\s)|curl(?=\s)/g;
    let lastIndex = 0;
    let key = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(code)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={key++} style={{ color: "var(--text-secondary)" }}>
            {code.slice(lastIndex, match.index)}
          </span>
        );
      }

      const token = match[0];
      const color =
        token === "curl"
          ? "var(--interactive)"
          : token.startsWith("$")
            ? "var(--step-embed)"
            : token.startsWith('"')
              ? "var(--step-respond)"
              : "var(--text-muted)";

      parts.push(
        <span key={key++} style={{ color }}>
          {token}
        </span>
      );
      lastIndex = match.index + token.length;
    }

    if (lastIndex < code.length) {
      parts.push(
        <span key={key++} style={{ color: "var(--text-secondary)" }}>
          {code.slice(lastIndex)}
        </span>
      );
    }

    return <>{parts}</>;
  }

  const keywords =
    lang === "ts"
      ? TS_KEYWORDS
      : lang === "python"
        ? PYTHON_KEYWORDS
        : JAVA_KEYWORDS;
  const parts: ReactNode[] = [];
  const regex = /"[^"]*"|'[^']*'|\b\w+\b/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++} style={{ color: "var(--text-muted)" }}>
          {code.slice(lastIndex, match.index)}
        </span>
      );
    }

    const token = match[0];
    const color =
      token.startsWith('"') || token.startsWith("'")
        ? "var(--step-respond)"
        : keywords.has(token)
          ? "var(--interactive)"
          : /^[A-Z]/.test(token)
            ? "var(--step-embed)"
            : "var(--text-secondary)";

    parts.push(
      <span key={key++} style={{ color }}>
        {token}
      </span>
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < code.length) {
    parts.push(
      <span key={key++} style={{ color: "var(--text-muted)" }}>
        {code.slice(lastIndex)}
      </span>
    );
  }

  return <>{parts}</>;
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="transition-opacity hover:opacity-75"
      style={{ color: "var(--text-muted)" }}
    >
      {copied ? (
        <Check size={13} style={{ color: "var(--step-respond)" }} />
      ) : (
        <Copy size={13} />
      )}
    </button>
  );
}
