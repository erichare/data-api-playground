/**
 * Compact inline pipeline summary displayed in the message bubble footer.
 *
 * Shows coloured step chips (Prep, Analyze, Embed, Search, Respond) that
 * can be toggled to reveal step-level detail panels.
 */
"use client";

import { Activity, ChevronDown } from "lucide-react";
import type { PipelineStep, PipelineStepId, PipelineStepStatus } from "@/lib/types";

export const PIPELINE_SUMMARY_ORDER: PipelineStepId[] = [
  "prepare",
  "analyze",
  "embed",
  "search",
  "respond",
];

const PIPELINE_SUMMARY_LABELS: Record<PipelineStepId, string> = {
  prepare: "Prep",
  analyze: "Analyze",
  embed: "Embed",
  search: "Search",
  respond: "Respond",
};

export function getPipelineTone(status: PipelineStepStatus) {
  switch (status) {
    case "complete":
      return {
        backgroundColor: "rgba(34,197,94,0.12)",
        color: "#22c55e",
        dotClassName: "",
      };
    case "running":
      return {
        backgroundColor: "var(--interactive-light)",
        color: "var(--interactive)",
        dotClassName: "animate-pulse",
      };
    case "error":
      return {
        backgroundColor: "rgba(239,68,68,0.12)",
        color: "#ef4444",
        dotClassName: "",
      };
    default:
      return {
        backgroundColor: "var(--bg-hover)",
        color: "var(--text-muted)",
        dotClassName: "",
      };
  }
}

export function hasStepDetails(step: PipelineStep) {
  return !!step.data && Object.keys(step.data).length > 0;
}

export function PipelineSummary(args: {
  steps: PipelineStep[];
  activeStepId: PipelineStepId | null;
  onToggleStep: (stepId: PipelineStepId) => void;
}) {
  const { steps, activeStepId, onToggleStep } = args;
  if (steps.length === 0) return null;

  const stepMap = new Map(steps.map((step) => [step.id, step]));
  const visibleSteps = PIPELINE_SUMMARY_ORDER.filter((stepId) => stepMap.has(stepId));

  if (visibleSteps.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1">
        <Activity size={11} style={{ color: "var(--text-muted)" }} />
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--text-muted)" }}
        >
          Pipeline
        </span>
      </div>
      {visibleSteps.map((stepId) => {
        const step = stepMap.get(stepId);
        if (!step) return null;
        const tone = getPipelineTone(step.status);
        const isActive = activeStepId === stepId;
        const isInteractive = hasStepDetails(step);

        if (!isInteractive) {
          return (
            <span
              key={stepId}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
              style={{
                backgroundColor: tone.backgroundColor,
                color: tone.color,
              }}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${tone.dotClassName}`}
                style={{ backgroundColor: tone.color }}
              />
              {PIPELINE_SUMMARY_LABELS[stepId]}
            </span>
          );
        }

        return (
          <button
            key={stepId}
            type="button"
            onClick={() => onToggleStep(stepId)}
            aria-pressed={isActive}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-all"
            style={{
              backgroundColor: tone.backgroundColor,
              color: tone.color,
              border: `1px solid ${
                isActive ? tone.color : "rgba(255,255,255,0.06)"
              }`,
              boxShadow: isActive ? `0 0 0 1px ${tone.backgroundColor}` : "none",
            }}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${tone.dotClassName}`}
              style={{ backgroundColor: tone.color }}
            />
            {PIPELINE_SUMMARY_LABELS[stepId]}
            <ChevronDown
              size={10}
              className="transition-transform"
              style={{
                color: tone.color,
                transform: isActive ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
