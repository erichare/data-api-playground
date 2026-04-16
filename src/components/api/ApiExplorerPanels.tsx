"use client";
/* eslint-disable security/detect-object-injection -- Presentation code indexes typed maps with constrained enum-like keys. */

import { motion } from "framer-motion";
import { Play } from "lucide-react";
import {
  CATEGORIES,
  CODE_LANGS,
  LANG_META,
  OPS,
  type ApiResponse,
  type ClientCallLogEntry,
  type CodeLang,
  type OpId,
} from "./apiExplorerConfig";
import {
  CopyButton,
  HighlightedCode,
  HighlightedJson,
} from "./apiExplorerPresentation";

interface ApiOperationsPanelProps {
  selectedOp: OpId;
  onSelectOp: (op: OpId) => void;
}

export function ApiOperationsPanel({
  selectedOp,
  onSelectOp,
}: ApiOperationsPanelProps) {
  return (
    <div
      className="flex flex-col w-44 shrink-0 border-r overflow-y-auto"
      style={{
        borderColor: "var(--border-subtle)",
        backgroundColor: "var(--bg-panel)",
      }}
    >
      <div className="px-3 pt-4 pb-1">
        <p
          className="text-[9px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)" }}
        >
          Operations
        </p>
      </div>

      {CATEGORIES.map((category) => {
        const categoryOps = OPS.filter((operation) => operation.category === category.id);

        return (
          <div key={category.id} className="mt-3">
            <p
              className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-muted)" }}
            >
              {category.label}
            </p>
            {categoryOps.map((operation) => {
              const active = selectedOp === operation.id;

              return (
                <button
                  key={operation.id}
                  type="button"
                  onClick={() => onSelectOp(operation.id)}
                  className="w-full text-left px-3 py-2 text-xs transition-colors"
                  style={{
                    backgroundColor: active ? "var(--interactive-light)" : "transparent",
                    color: active ? "var(--interactive)" : "var(--text-secondary)",
                    borderLeft: `2px solid ${active ? "var(--interactive)" : "transparent"}`,
                  }}
                >
                  {operation.label}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

interface ApiRequestPanelProps {
  selectedOp: OpId;
  endpointPath: string;
  endpointCopyText: string;
  body: string;
  bodyError: string;
  onBodyChange: (nextBody: string) => void;
  running: boolean;
  hasCollection: boolean;
  onRun: () => void;
  codeLang: CodeLang;
  onCodeLangChange: (lang: CodeLang) => void;
  code: string;
}

export function ApiRequestPanel({
  selectedOp,
  endpointPath,
  endpointCopyText,
  body,
  bodyError,
  onBodyChange,
  running,
  hasCollection,
  onRun,
  codeLang,
  onCodeLangChange,
  code,
}: ApiRequestPanelProps) {
  const description = OPS.find((operation) => operation.id === selectedOp)?.description;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-y-auto">
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b"
        style={{
          borderColor: "var(--border-subtle)",
          backgroundColor: "var(--bg-panel)",
        }}
      >
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded shrink-0"
          style={{
            backgroundColor: "var(--interactive-light)",
            color: "var(--interactive)",
            fontFamily: "IBM Plex Mono, monospace",
          }}
        >
          POST
        </span>
        <span
          className="text-xs flex-1 truncate"
          style={{ color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}
        >
          {endpointPath}
        </span>
        <CopyButton text={endpointCopyText} />
      </div>

      <div className="flex flex-col px-5 py-5 gap-5">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Request Body
            </span>
            {bodyError ? (
              <span className="text-[10px]" style={{ color: "var(--step-search)" }}>
                {bodyError}
              </span>
            ) : null}
          </div>
          <textarea
            data-testid="api-request-body"
            aria-label="Request body"
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            rows={10}
            className="w-full text-xs resize-none rounded-lg px-3 py-2.5 outline-none"
            style={{
              backgroundColor: "var(--bg-input)",
              border: `1px solid ${bodyError ? "var(--step-search)" : "var(--border-subtle)"}`,
              color: "var(--text-primary)",
              fontFamily: "IBM Plex Mono, monospace",
              lineHeight: "1.65",
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <motion.button
            data-testid="api-run-button"
            type="button"
            onClick={onRun}
            disabled={running || !hasCollection}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
            style={{
              backgroundColor: "var(--interactive)",
              color: "#fff",
              opacity: running || !hasCollection ? 0.45 : 1,
              cursor: running || !hasCollection ? "not-allowed" : "pointer",
            }}
          >
            {running ? (
              <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <Play size={12} />
            )}
            {running ? "Running…" : "Run"}
          </motion.button>
          {!hasCollection ? (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Select a collection from the sidebar to run requests
            </span>
          ) : null}
        </div>

        <div className="border-t pt-5" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center justify-between mb-2.5">
            <div
              className="flex rounded-lg p-0.5 gap-0.5"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {CODE_LANGS.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => onCodeLangChange(lang)}
                  className="px-3 py-1 rounded-md text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor:
                      codeLang === lang ? "var(--bg-panel)" : "transparent",
                    color:
                      codeLang === lang ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  {LANG_META[lang].label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] px-2 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--bg-card)",
                  color: "var(--text-muted)",
                  fontFamily: "IBM Plex Mono, monospace",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {LANG_META[codeLang].badge}
              </span>
              <CopyButton text={code} />
            </div>
          </div>

          <div
            className="rounded-lg px-4 py-3 overflow-x-auto"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <pre
              className="text-[11px] leading-relaxed whitespace-pre"
              style={{ fontFamily: "IBM Plex Mono, monospace" }}
            >
              <HighlightedCode code={code} lang={codeLang} />
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ApiResponsePanelProps {
  response: ApiResponse | null;
  responseJson: string | null;
  running: boolean;
  clientCalls: ClientCallLogEntry[];
  clientCallsLoading: boolean;
}

export function ApiResponsePanel({
  response,
  responseJson,
  running,
  clientCalls,
  clientCallsLoading,
}: ApiResponsePanelProps) {
  const statusOk =
    response !== null && response.status >= 200 && response.status < 300;
  const hasClientCalls = clientCalls.length > 0;

  return (
    <div
      className="flex flex-col border-l overflow-hidden"
      style={{
        width: "420px",
        minWidth: "320px",
        borderColor: "var(--border-subtle)",
        backgroundColor: "var(--bg-panel)",
      }}
    >
      <div className="flex flex-col min-h-0" style={{ flex: "0 0 42%" }}>
        <div
          className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <span
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            Response
          </span>
          {response ? (
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded"
                style={{
                  backgroundColor: statusOk
                    ? "rgba(34,197,94,0.1)"
                    : "rgba(255,107,53,0.1)",
                  color: statusOk ? "var(--step-respond)" : "var(--step-search)",
                  fontFamily: "IBM Plex Mono, monospace",
                }}
              >
                {response.status} {response.statusText}
              </span>
              {response.latencyMs > 0 ? (
                <span
                  className="text-[10px]"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "IBM Plex Mono, monospace",
                  }}
                >
                  {response.latencyMs}ms
                </span>
              ) : null}
              {responseJson ? <CopyButton text={responseJson} /> : null}
            </div>
          ) : null}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {!response ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                {running ? "Running request…" : "Hit Run to see the response"}
              </p>
            </div>
          ) : responseJson ? (
            <pre
              className="text-[11px] leading-relaxed whitespace-pre-wrap break-all"
              style={{ fontFamily: "IBM Plex Mono, monospace" }}
            >
              <HighlightedJson json={responseJson} />
            </pre>
          ) : null}
        </div>
      </div>

      <div
        className="flex flex-col flex-1 min-h-0 border-t"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div
          className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-muted)" }}
            >
              TypeScript Client Log
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Runtime `astra-db-ts` calls across the app
            </span>
          </div>
          {hasClientCalls ? (
            <span
              className="text-[10px] px-2 py-0.5 rounded"
              style={{
                backgroundColor: "var(--bg-card)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
                fontFamily: "IBM Plex Mono, monospace",
              }}
            >
              {clientCalls.length}
            </span>
          ) : null}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          {!hasClientCalls ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                {clientCallsLoading
                  ? "Loading runtime call history…"
                  : "Run API requests, chat, browse, or ingest to see live TypeScript client calls here."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {clientCalls.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg overflow-hidden"
                  style={{
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-card)",
                  }}
                >
                  <div
                    className="flex items-center justify-between gap-3 px-3 py-2 border-b"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <div className="min-w-0">
                      <p
                        className="text-[11px] font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {entry.label}
                      </p>
                      <p
                        className="text-[10px]"
                        style={{
                          color: "var(--text-muted)",
                          fontFamily: "IBM Plex Mono, monospace",
                        }}
                      >
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <CopyButton text={entry.code} />
                  </div>
                  <div className="px-3 py-2 overflow-x-auto">
                    <pre
                      className="text-[11px] leading-relaxed whitespace-pre"
                      style={{ fontFamily: "IBM Plex Mono, monospace" }}
                    >
                      <HighlightedCode code={entry.code} lang="ts" />
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
