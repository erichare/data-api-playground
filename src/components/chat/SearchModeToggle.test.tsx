// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchModeToggle } from "./SearchModeToggle";

vi.mock("framer-motion", () => {
  const cleanProps = (props: Record<string, unknown>) => {
    const {
      initial,
      animate,
      exit,
      transition,
      whileHover,
      whileTap,
      layoutId,
      ...rest
    } = props;

    void initial;
    void animate;
    void exit;
    void transition;
    void whileHover;
    void whileTap;
    void layoutId;
    return rest;
  };

  return {
    motion: {
      button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...cleanProps(props)}>{children}</button>
      ),
      span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
        <span {...cleanProps(props)}>{children}</span>
      ),
    },
  };
});

describe("SearchModeToggle", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all search modes with titles and highlights the active mode", () => {
    render(<SearchModeToggle value="hybrid" onChange={vi.fn()} />);

    expect(screen.getByTitle("Dense embedding search")).toBeTruthy();
    expect(screen.getByTitle("Vector + keyword")).toBeTruthy();
    expect(screen.getByTitle("BM25 full-text")).toBeTruthy();
    expect(screen.getByText("Hybrid").closest("button")?.style.color).toBe("rgb(255, 255, 255)");
    expect(screen.getByText("Vector").closest("button")?.style.color).not.toBe("rgb(255, 255, 255)");
  });

  it("notifies callers when a different mode is selected", () => {
    const onChange = vi.fn();
    render(<SearchModeToggle value="vector" onChange={onChange} />);

    fireEvent.click(screen.getByText("Hybrid"));
    fireEvent.click(screen.getByText("Lexical"));

    expect(onChange).toHaveBeenNthCalledWith(1, "hybrid");
    expect(onChange).toHaveBeenNthCalledWith(2, "lexical");
  });
});
