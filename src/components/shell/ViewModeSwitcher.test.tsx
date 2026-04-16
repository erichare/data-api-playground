// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewModeSwitcher } from "./ViewModeSwitcher";

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
      button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...cleanProps(props)}>{children}</button>
      ),
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...cleanProps(props)}>{children}</div>
      ),
      span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
        <span {...cleanProps(props)}>{children}</span>
      ),
    },
  };
});

describe("ViewModeSwitcher", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all modes and forwards selection changes", () => {
    const onChange = vi.fn();

    render(<ViewModeSwitcher viewMode="chat" activeCollection="orders" onChange={onChange} />);

    fireEvent.click(screen.getByText("Chat"));
    fireEvent.click(screen.getByText("Ingest"));
    fireEvent.click(screen.getByText("API"));

    expect(onChange.mock.calls).toEqual([["chat"], ["ingest"], ["api"]]);
    expect(screen.queryByText("orders")).toBeNull();
  });

  it("shows the active collection label only in api mode when a collection is selected", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ViewModeSwitcher viewMode="api" activeCollection="orders" onChange={onChange} />
    );

    expect(screen.getByText("orders")).toBeTruthy();

    rerender(<ViewModeSwitcher viewMode="api" onChange={onChange} />);
    expect(screen.queryByText("orders")).toBeNull();

    rerender(
      <ViewModeSwitcher viewMode="ingest" activeCollection="orders" onChange={onChange} />
    );
    expect(screen.queryByText("orders")).toBeNull();
  });

  it("hides the API button when API explorer mode is not available", () => {
    const onChange = vi.fn();

    render(
      <ViewModeSwitcher
        viewMode="chat"
        activeCollection="orders"
        showApiMode={false}
        onChange={onChange}
      />
    );

    expect(screen.getByText("Chat")).toBeTruthy();
    expect(screen.getByText("Ingest")).toBeTruthy();
    expect(screen.queryByText("API")).toBeNull();
  });
});
