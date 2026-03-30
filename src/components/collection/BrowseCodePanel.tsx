"use client";

import { useState } from "react";
import {
  BROWSE_LANG_LABELS,
  BROWSE_LANG_SDK,
  BrowseCodeLang,
  BrowseCopyButton,
  getBrowseCode,
  renderBrowseCode,
} from "@/components/collection/collectionBrowseShared";

interface BrowseCodePanelProps {
  collectionName: string;
  sort: { col: string; dir: 1 | -1 } | null;
}

export function BrowseCodePanel({ collectionName, sort }: BrowseCodePanelProps) {
  const [lang, setLang] = useState<BrowseCodeLang>("ts");
  const code = getBrowseCode(lang, collectionName, sort);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-subtle)" }}
      >
        <div className="flex gap-0.5">
          {(Object.keys(BROWSE_LANG_LABELS) as BrowseCodeLang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
              style={{
                backgroundColor: lang === l ? "var(--interactive-light)" : "transparent",
                color: lang === l ? "var(--interactive)" : "var(--text-muted)",
                border: lang === l ? "1px solid var(--interactive-border)" : "1px solid transparent",
              }}
            >
              {BROWSE_LANG_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}>
            {BROWSE_LANG_SDK[lang]}
          </span>
          <BrowseCopyButton text={code} />
        </div>
      </div>
      <div style={{ backgroundColor: "var(--bg-card)" }}>
        <pre
          className="text-[12px] px-4 py-3 overflow-x-auto leading-relaxed"
          style={{
            fontFamily: "IBM Plex Mono, monospace",
            color: "var(--text-secondary)",
            whiteSpace: "pre",
            margin: 0,
          }}
        >
          {renderBrowseCode(lang, code)}
        </pre>
      </div>
    </div>
  );
}
