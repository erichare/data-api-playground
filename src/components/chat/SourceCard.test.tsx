// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceCard } from "./SourceCard";

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
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

describe("SourceCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("formats similarity thresholds with the expected colors", () => {
    render(
      <div>
        <SourceCard
          index={0}
          source={{ collection: "orders", id: "doc-high", similarity: 0.91, preview: { title: "Alpha" } }}
        />
        <SourceCard
          index={1}
          source={{ collection: "orders", id: "doc-mid", similarity: 0.75, preview: { title: "Beta" } }}
        />
        <SourceCard
          index={2}
          source={{ collection: "orders", id: "doc-low", similarity: 0.42, preview: { title: "Gamma" } }}
        />
      </div>
    );

    expect(screen.getByText("0.91").style.color).toBe("rgb(16, 185, 129)");
    expect(screen.getByText("0.75").style.color).toBe("rgb(245, 158, 11)");
    expect(screen.getByText("0.42").style.color).toBe("rgb(255, 107, 53)");
  });

  it("expands and collapses the document preview", () => {
    render(
      <SourceCard
        index={0}
        source={{
          collection: "orders",
          id: "doc-1",
          similarity: 0.91,
          preview: { title: "Alpha", total_spend: 42 },
        }}
      />
    );

    expect(screen.queryByText("Document Preview")).toBeNull();

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Document Preview")).toBeTruthy();
    expect(screen.getByText(/"title": "Alpha"/)).toBeTruthy();
    expect(screen.getByText(/"total_spend": 42/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button"));

    expect(screen.queryByText("Document Preview")).toBeNull();
  });
});
