// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PipelineTrace } from "./PipelineTrace";
import type { PipelineStep } from "@/lib/types";

vi.mock("framer-motion", () => {
  const cleanProps = (props: Record<string, unknown>) => {
    const {
      initial,
      animate,
      exit,
      transition,
      whileHover,
      whileTap,
      ...rest
    } = props;

    void initial;
    void animate;
    void exit;
    void transition;
    void whileHover;
    void whileTap;
    return rest;
  };

  return {
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...cleanProps(props)}>{children}</div>
      ),
      button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...cleanProps(props)}>{children}</button>
      ),
      span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
        <span {...cleanProps(props)}>{children}</span>
      ),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

function makeDetailedSteps(): PipelineStep[] {
  return [
    {
      id: "analyze",
      status: "complete",
      latencyMs: 5,
      data: {
        intent: "collection_overview",
        allCollections: true,
        collections: ["orders", "users"],
        searchMode: "hybrid",
        limit: 3,
        sortField: "total_spend",
        sortDir: "desc",
        filterField: "status",
        filterOp: "$eq",
        filterValue: "active",
        _raw: '{"intent":"collection_overview"}',
      },
    },
    {
      id: "embed",
      status: "complete",
      latencyMs: 7,
      data: {
        preview: [0.1, 0.2, 0.3],
        dims: 768,
        real: false,
        error: "Granite unavailable",
      },
    },
    {
      id: "search",
      status: "complete",
      latencyMs: 11,
      data: {
        collections: ["orders", "users"],
        results: [
          {
            id: "doc-1",
            similarity: 0.9123,
            collection: "orders",
            preview: { title: "Alpha", total_spend: 42 },
          },
        ],
      },
    },
    {
      id: "respond",
      status: "complete",
      latencyMs: 13,
      data: {
        content: "This answer summarizes the matching orders and highlights the strongest result for the user.",
      },
    },
  ];
}

describe("PipelineTrace", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders detailed previews for analyze, embed, search, and respond steps", () => {
    render(<PipelineTrace steps={makeDetailedSteps()} />);

    expect(screen.getByText("36ms total")).toBeTruthy();
    expect(screen.getByText("hybrid")).toBeTruthy();
    expect(screen.getByText(/total_spend desc/)).toBeTruthy();
    expect(screen.getByText(/status "active"/)).toBeTruthy();
    expect(screen.getByText('{"intent":"collection_overview"}')).toBeTruthy();
    expect(screen.getByText("[0.1000, 0.2000, 0.3000, …]")).toBeTruthy();
    expect(screen.getByText("mock")).toBeTruthy();
    expect(screen.getByText("Granite unavailable")).toBeTruthy();
    expect(screen.getByText("Searched:")).toBeTruthy();
    expect(screen.getByText("1. doc-1")).toBeTruthy();
    expect(screen.getByText("0.912")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText(/This answer summarizes the matching orders/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Analyze Query/i }));
    expect(screen.queryByText('{"intent":"collection_overview"}')).toBeNull();
  });

  it("shows running state and placeholder rows when the trace is expanded from a collapsed header", () => {
    render(
      <PipelineTrace
        defaultExpanded={false}
        steps={[
          {
            id: "analyze",
            status: "running",
            latencyMs: 5,
            data: { intent: "lookup" },
          },
        ]}
      />
    );

    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.queryByText("Analyze Query")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Pipeline Trace/i }));

    expect(screen.getByText("Analyze Query")).toBeTruthy();
    expect(screen.getByText("Embed with Granite")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Pipeline Trace/i }));
    expect(screen.queryByText("Analyze Query")).toBeNull();
  });
});
