// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

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
      header: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <header {...cleanProps(props)}>{children}</header>
      ),
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

describe("Header", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the env-ready connect state and wires the action buttons", () => {
    const onConnectionClick = vi.fn();
    const onSettingsClick = vi.fn();
    const onToggleTheme = vi.fn();
    const onSignOut = vi.fn();

    render(
      <Header
        envReady={true}
        onConnectionClick={onConnectionClick}
        onSettingsClick={onSettingsClick}
        onToggleTheme={onToggleTheme}
        authEnabled={true}
        onSignOut={onSignOut}
        theme="dark"
      />
    );

    expect(screen.getByTestId("header-connect-button").textContent).toContain("Env Ready");

    fireEvent.click(screen.getByTestId("header-connect-button"));
    fireEvent.click(screen.getByTitle("Quick Start & Settings"));
    fireEvent.click(screen.getByTitle("Switch to light mode"));
    fireEvent.click(screen.getByTestId("header-signout-button"));

    expect(onConnectionClick).toHaveBeenCalledTimes(1);
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("renders the connected state and light-mode toggle title", () => {
    const onConnectionClick = vi.fn();

    render(
      <Header
        connected={true}
        onConnectionClick={onConnectionClick}
        theme="light"
      />
    );

    expect(screen.getByTestId("header-connected-button").textContent).toContain("Connected");
    expect(screen.queryByTestId("header-connect-button")).toBeNull();
    expect(screen.queryByTestId("header-signout-button")).toBeNull();

    fireEvent.click(screen.getByTestId("header-connected-button"));

    expect(onConnectionClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle("Switch to dark mode")).toBeTruthy();
  });
});
