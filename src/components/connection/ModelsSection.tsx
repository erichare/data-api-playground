"use client";

import { CheckCircle2, Cpu, Eye, EyeOff, KeyRound } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AiStatus } from "@/lib/ai/types";
import { inputStyle, labelStyle } from "@/components/connection/styles";
import {
  getActiveAiSummary,
  getActiveModelConfig,
} from "@/components/connection/utils";

interface ModelsSectionProps {
  aiStatus: AiStatus | null;
  huggingfaceApiKey: string;
  setHuggingfaceApiKey: Dispatch<SetStateAction<string>>;
  showHuggingfaceApiKey: boolean;
  setShowHuggingfaceApiKey: Dispatch<SetStateAction<boolean>>;
  onHuggingfaceApiKeyChange: (key: string) => void;
}

export function ModelsSection({
  aiStatus,
  huggingfaceApiKey,
  setHuggingfaceApiKey,
  showHuggingfaceApiKey,
  setShowHuggingfaceApiKey,
  onHuggingfaceApiKeyChange,
}: ModelsSectionProps) {
  const trimmedHuggingFaceKey = huggingfaceApiKey.trim();
  const activeAiSummary = getActiveAiSummary(aiStatus, trimmedHuggingFaceKey);
  const activeModelConfig = getActiveModelConfig(aiStatus, trimmedHuggingFaceKey);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label style={labelStyle}>Models</label>
        <p
          className="text-[11px] mb-2 leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          Control the optional Hugging Face override and see which chat and embedding models new requests will use.
        </p>
      </div>

      <div
        className="px-3 py-3 rounded-xl"
        style={{
          backgroundColor: activeAiSummary.tone,
          border: `1px solid ${activeAiSummary.border}`,
        }}
      >
        <div className="flex items-start gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: "rgba(255,255,255,0.04)",
              color: activeAiSummary.accent,
            }}
          >
            {trimmedHuggingFaceKey || aiStatus?.hasHuggingFaceEnvKey ? (
              <KeyRound size={14} />
            ) : (
              <Cpu size={14} />
            )}
          </div>
          <div className="min-w-0">
            <div
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: activeAiSummary.accent }}
            >
              Active Provider
            </div>
            <div
              className="text-[13px] font-semibold mt-0.5"
              style={{ color: "var(--text-primary)" }}
            >
              {activeAiSummary.label}
            </div>
            <p
              className="text-[11px] mt-1 leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {activeAiSummary.detail}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {[
          {
            label: "Provider Source",
            value: `${activeModelConfig.providerLabel} · ${activeModelConfig.sourceLabel}`,
          },
          {
            label: "Chat Model",
            value: activeModelConfig.chatModel ?? "Checking server config...",
          },
          {
            label: "Embedding Model",
            value: activeModelConfig.embedModel ?? "Checking server config...",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl px-3 py-2.5"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              className="text-[10px] uppercase tracking-widest font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              {item.label}
            </div>
            <div
              className="text-[12px] mt-1"
              style={{
                color: "var(--text-primary)",
                fontFamily: "IBM Plex Mono, monospace",
                overflowWrap: "anywhere",
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label style={{ ...labelStyle, marginBottom: 0 }}>Hugging Face API Key</label>
          {trimmedHuggingFaceKey ? (
            <span
              className="flex items-center gap-1 text-[10px]"
              style={{ color: "#22c55e" }}
            >
              <CheckCircle2 size={10} /> Will override env
            </span>
          ) : aiStatus?.hasHuggingFaceEnvKey ? (
            <span
              className="flex items-center gap-1 text-[10px]"
              style={{ color: "#22c55e" }}
            >
              <CheckCircle2 size={10} /> Set via environment
            </span>
          ) : (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Optional
            </span>
          )}
        </div>
        <div className="relative">
          <input
            type={showHuggingfaceApiKey ? "text" : "password"}
            value={huggingfaceApiKey}
            onChange={(event) => setHuggingfaceApiKey(event.target.value)}
            onBlur={() => onHuggingfaceApiKeyChange(huggingfaceApiKey.trim())}
            data-testid="huggingface-api-key-input"
            placeholder={
              aiStatus?.hasHuggingFaceEnvKey
                ? "Override environment key..."
                : "hf_xxxxxxxxxxxxx"
            }
            style={{ ...inputStyle, paddingRight: "40px" }}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore="true"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowHuggingfaceApiKey((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          >
            {showHuggingfaceApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
          Optional. When omitted, the app falls back to local Ollama for chat and embeddings.
        </p>
      </div>
    </div>
  );
}
