// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "@/lib/types";

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

vi.mock("./PipelineTrace", () => ({
  PipelineTrace: ({ steps }: { steps: Array<{ id: string }> }) => (
    <div data-testid="pipeline-trace">{steps.map((step) => step.id).join(",")}</div>
  ),
  StepDataPreview: ({
    stepId,
    data,
  }: {
    stepId: string;
    data: Record<string, unknown>;
  }) => (
    <div data-testid="step-data-preview">
      {stepId}:{String(data.message ?? data.content ?? data.searchMode ?? "details")}
    </div>
  ),
}));

const SEARCH_COMMAND = 'await db.collection("orders")\n  .find({}, { sort: { total_spend: -1 }, limit: 3 })';
const EXPECTED_TS_CODE = [
  'const collection = db.collection("orders");',
  "",
  "const results = await collection.find({}, { sort: { total_spend: -1 }, limit: 3 }).toArray();",
].join("\n");

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    role: "assistant",
    content: "**Top customers**\n\n- Alice\n- Bob",
    latencyMs: 1500,
    timestamp: new Date("2026-03-30T12:00:00.000Z"),
    pipelineSteps: [
      {
        id: "analyze",
        status: "complete",
        latencyMs: 5,
        data: { searchMode: "hybrid" },
      },
      {
        id: "search",
        status: "complete",
        latencyMs: 8,
        data: {
          command: SEARCH_COMMAND,
          collection: "orders",
        },
      },
      {
        id: "respond",
        status: "complete",
        latencyMs: 12,
        data: { content: "Alice had the largest order total." },
      },
    ],
    ...overrides,
  };
}

describe("MessageBubble", () => {
  const originalClipboard = navigator.clipboard;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const writeText = vi.fn(async () => undefined);
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView,
    });
  });

  it("renders user messages without assistant tabs", () => {
    render(
      <MessageBubble
        index={0}
        message={makeMessage({
          role: "user",
          content: "Show me the biggest orders",
          pipelineSteps: undefined,
          latencyMs: undefined,
        })}
      />
    );

    expect(screen.getByText("Show me the biggest orders")).toBeTruthy();
    expect(screen.queryByText("Output")).toBeNull();
    expect(screen.queryByText("Code")).toBeNull();
    expect(screen.queryByText("Trace")).toBeNull();
  });

  it("shows pipeline details inline when a step chip is toggled", () => {
    render(
      <MessageBubble
        index={1}
        message={makeMessage({
          pipelineSteps: [
            {
              id: "prepare",
              status: "complete",
              latencyMs: 3,
              data: {
                provider: "ollama",
                model: "granite",
                message: "Model already installed",
              },
            },
            {
              id: "analyze",
              status: "complete",
              latencyMs: 5,
              data: { searchMode: "hybrid" },
            },
            {
              id: "search",
              status: "complete",
              latencyMs: 8,
              data: {
                command: SEARCH_COMMAND,
                collection: "orders",
              },
            },
          ],
        })}
      />
    );

    expect(screen.queryByTestId("step-data-preview")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /prep/i }));
    expect(screen.getByTestId("step-data-preview").textContent).toContain(
      "prepare:Model already installed"
    );
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "end",
      inline: "nearest",
    });

    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    expect(screen.getByTestId("step-data-preview").textContent).toContain(
      "analyze:hybrid"
    );

    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    expect(screen.queryByTestId("step-data-preview")).toBeNull();
  });

  it("renders assistant output without extra tabs when there is no search command or trace", () => {
    render(
      <MessageBubble
        index={0}
        message={makeMessage({
          content: "Use `orders` for the next query.",
          latencyMs: 320,
          pipelineSteps: undefined,
        })}
      />
    );

    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes("Use orders for the next query.") ?? false
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByText("320ms")).toBeTruthy();
    expect(screen.queryByText("Code")).toBeNull();
    expect(screen.queryByText("Trace")).toBeNull();
  });

  it("renders rich markdown output with headings, ordered lists, tables, and inline code", () => {
    render(
      <MessageBubble
        index={0}
        message={makeMessage({
          content: [
            "# Summary",
            "",
            "1. Alice",
            "2. Bob",
            "",
            "| Name | Spend |",
            "| --- | --- |",
            "| Alice | 120 |",
            "",
            "Use `orders` for the next query.",
          ].join("\n"),
          pipelineSteps: undefined,
          latencyMs: undefined,
        })}
      />
    );

    expect(screen.getByText("Summary")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Spend")).toBeTruthy();
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
    expect(screen.getAllByText("orders").length).toBeGreaterThan(0);
  });

  it("shows a streaming fallback message when the assistant has not emitted content yet", () => {
    render(
      <MessageBubble
        index={0}
        streaming
        message={makeMessage({
          content: "   ",
          latencyMs: undefined,
          pipelineSteps: undefined,
        })}
      />
    );

    expect(screen.getByText("Working through the pipeline...")).toBeTruthy();
    expect(screen.queryByText("Code")).toBeNull();
    expect(screen.queryByText("Trace")).toBeNull();
  });

  it("switches assistant tabs and copies generated search code", async () => {
    render(<MessageBubble index={1} message={makeMessage()} />);

    expect(screen.getByText("Top customers")).toBeTruthy();
    expect(screen.getByText("1.5s")).toBeTruthy();
    expect(screen.getByText("Analyze")).toBeTruthy();
    expect(screen.getByText("Search")).toBeTruthy();
    expect(screen.queryByText("Trace")).toBeNull();

    fireEvent.click(screen.getByText("Code"));

    expect(screen.getByText("TypeScript")).toBeTruthy();
    expect(screen.getByText("astra-db-ts")).toBeTruthy();
    expect(screen.getByText(/orders/)).toBeTruthy();

    fireEvent.click(screen.getByTitle("Copy to clipboard"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(EXPECTED_TS_CODE);
    expect(screen.getByText("Copied")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1800);
    });

    expect(screen.getByText("Copy")).toBeTruthy();

    fireEvent.click(screen.getByText("Python"));
    expect(screen.getByText("astrapy")).toBeTruthy();
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes("SortDocuments.DESCENDING") ?? false
      ).length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Output"));
    expect(screen.queryByTestId("pipeline-trace")).toBeNull();
  });

  it("renders vectorize search code variants", () => {
    render(
      <MessageBubble
        index={1}
        message={makeMessage({
          pipelineSteps: [
            {
              id: "search",
              status: "complete",
              latencyMs: 8,
              data: {
                command:
                  'await db.collection("docs")\n  .find({}, { sort: { $vectorize: query }, limit: 6 })',
                collection: "docs",
              },
            },
          ],
        })}
      />
    );

    fireEvent.click(screen.getByText("Code"));
    fireEvent.click(screen.getByText("Python"));
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('sort={"$vectorize": query}') ?? false
      ).length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Java"));
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes("Sorts.vectorize(query)") ?? false
      ).length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("cURL"));
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('"$vectorize": "<query>"') ?? false
      ).length
    ).toBeGreaterThan(0);
  });

  it("renders hybrid rerank code variants", () => {
    render(
      <MessageBubble
        index={1}
        message={makeMessage({
          pipelineSteps: [
            {
              id: "search",
              status: "complete",
              latencyMs: 8,
              data: {
                command:
                  'await db.collection("docs")\n  .findAndRerank({}, { sort: { $hybrid: { $vectorize: query } }, limit: 4 })',
                collection: "docs",
              },
            },
          ],
        })}
      />
    );

    fireEvent.click(screen.getByText("Code"));
    fireEvent.click(screen.getByText("Python"));
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes("collection.find_and_rerank(") ?? false
      ).length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Java"));
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes("FindOneAndRerankOptions") ?? false
      ).length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("cURL"));
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('"findAndRerank"') ?? false
      ).length
    ).toBeGreaterThan(0);
  });

  it("renders a usable TypeScript snippet when the search command is only a fallback summary", () => {
    render(
      <MessageBubble
        index={1}
        message={makeMessage({
          pipelineSteps: [
            {
              id: "search",
              status: "complete",
              latencyMs: 8,
              data: {
                command: "// Low-confidence fallback: searched customers",
                collection: "customers",
              },
            },
          ],
        })}
      />
    );

    fireEvent.click(screen.getByText("Code"));
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('const collection = db.collection("customers");') ?? false
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes("const results = await collection.find(") ?? false
      ).length
    ).toBeGreaterThan(0);
  });
});
