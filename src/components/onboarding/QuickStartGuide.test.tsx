// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickStartGuide } from "./QuickStartGuide";

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
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

describe("QuickStartGuide", () => {
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

  it("does not render when closed", () => {
    render(<QuickStartGuide open={false} onClose={vi.fn()} />);

    expect(screen.queryByText("Quick Start Guide")).toBeNull();
  });

  it("switches languages, copies snippets, and closes from the overlay", async () => {
    const onClose = vi.fn();
    render(<QuickStartGuide open={true} onClose={onClose} />);

    expect(screen.getByText("Quick Start Guide")).toBeTruthy();
    expect(screen.getByText("pip install astrapy")).toBeTruthy();

    fireEvent.click(screen.getByText("TypeScript"));
    expect(screen.getByText('npm install @datastax/astra-db-ts')).toBeTruthy();

    fireEvent.click(screen.getAllByTitle("Copy to clipboard")[0] as HTMLButtonElement);

    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('npm install @datastax/astra-db-ts');

    fireEvent.click(screen.getByText("Python SDK ↗"));
    expect(
      (screen.getByText("Python SDK ↗").closest("a") as HTMLAnchorElement).href
    ).toBe("https://github.com/datastax/astrapy");

    fireEvent.click(screen.getAllByRole("button")[0] as HTMLButtonElement);
    expect(onClose).toHaveBeenCalled();
  });
});
