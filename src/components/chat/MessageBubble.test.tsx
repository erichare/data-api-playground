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
}));

const SEARCH_COMMAND = 'await db.collection("orders")\n  .find({}, { sort: { total_spend: -1 }, limit: 3 })';
const EXPECTED_TS_CODE = 'await db.collection("orders")\n  .find({}, { sort: { total_spend: -1 }, limit: 3 })';

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
  const writeText = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
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

  it("switches assistant tabs and copies generated search code", async () => {
    render(<MessageBubble index={1} message={makeMessage()} />);

    expect(screen.getByText("Top customers")).toBeTruthy();
    expect(screen.getByText("1.5s")).toBeTruthy();

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

    fireEvent.click(screen.getByText("Trace"));
    expect(screen.getByTestId("pipeline-trace").textContent).toBe("analyze,search,respond");
  });
});
