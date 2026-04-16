"use client";

import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { KnowledgeBackendStatuses } from "@/lib/knowledge/types";
import { inputStyle, labelStyle } from "@/components/connection/styles";

interface OpenragFormProps {
  apiKey: string;
  setApiKey: Dispatch<SetStateAction<string>>;
  baseUrl: string;
  setBaseUrl: Dispatch<SetStateAction<string>>;
  showApiKey: boolean;
  setShowApiKey: Dispatch<SetStateAction<boolean>>;
  knowledgeStatuses: KnowledgeBackendStatuses | null;
}

export function OpenragForm({
  apiKey,
  setApiKey,
  baseUrl,
  setBaseUrl,
  showApiKey,
  setShowApiKey,
  knowledgeStatuses,
}: OpenragFormProps) {
  const trimmedApiKey = apiKey.trim();
  const trimmedBaseUrl = baseUrl.trim();

  return (
    <>
      <div>
        <label style={labelStyle}>OpenRAG Settings</label>
        <p
          className="text-[11px] mb-2 leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          Use OpenRAG for vector search and document ingestion. Hybrid search, lexical search, CSV ingest, the collections sidebar, and the API explorer stay disabled in this mode.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label style={{ ...labelStyle, marginBottom: 0 }}>OpenRAG API Key</label>
          {knowledgeStatuses?.openrag?.hasApiKey && !trimmedApiKey ? (
            <span
              className="flex items-center gap-1 text-[10px]"
              style={{ color: "#22c55e" }}
            >
              <CheckCircle2 size={10} /> Set via environment
            </span>
          ) : null}
        </div>
        <div className="relative">
          <input
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            data-testid="openrag-api-key-input"
            placeholder="orag_xxxxxxxxxxxxx"
            style={{ ...inputStyle, paddingRight: "40px" }}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore="true"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowApiKey((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          >
            {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label style={{ ...labelStyle, marginBottom: 0 }}>OpenRAG URL</label>
          {knowledgeStatuses?.openrag?.hasBaseUrl && !trimmedBaseUrl ? (
            <span
              className="flex items-center gap-1 text-[10px]"
              style={{ color: "#22c55e" }}
            >
              <CheckCircle2 size={10} /> Set via environment
            </span>
          ) : (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Defaults to http://localhost:3000
            </span>
          )}
        </div>
        <input
          type="text"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          data-testid="openrag-base-url-input"
          placeholder="https://openrag.example.com"
          style={inputStyle}
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
          OpenRAG uses semantic search and document ingestion. Hybrid, lexical, and CSV row ingest stay disabled for this backend.
        </p>
      </div>
    </>
  );
}
