// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      initial,
      animate,
      transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => {
      void initial;
      void animate;
      void transition;
      return <div {...props}>{children}</div>;
    },
  },
}));

describe("LoginForm", () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "http://localhost/login" },
    });
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("keeps the submit button disabled until the password has content", () => {
    render(<LoginForm />);

    const passwordInput = screen.getByTestId("login-password");
    const submitButton = screen.getByTestId("login-submit") as HTMLButtonElement;

    expect(submitButton.disabled).toBe(true);

    fireEvent.change(passwordInput, { target: { value: "   " } });
    expect(submitButton.disabled).toBe(true);

    fireEvent.change(passwordInput, { target: { value: "swordfish" } });
    expect(submitButton.disabled).toBe(false);
  });

  it("submits the password to the auth endpoint and redirects on success", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as typeof fetch;

    render(<LoginForm nextPath="/collections" />);

    fireEvent.change(screen.getByTestId("login-password"), {
      target: { value: "swordfish" },
    });
    fireEvent.submit(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "swordfish" }),
      });
    });
    expect(window.location.href).toBe("/collections");
  });

  it("shows the server error when the login attempt fails", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    ) as typeof fetch;

    render(<LoginForm />);

    fireEvent.change(screen.getByTestId("login-password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.submit(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(screen.getByText("Invalid password")).toBeTruthy();
    });
    expect((screen.getByTestId("login-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  it("falls back to a generic error when the request rejects with a non-Error value", async () => {
    global.fetch = vi.fn().mockRejectedValue("network down") as typeof fetch;

    render(<LoginForm />);

    fireEvent.change(screen.getByTestId("login-password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.submit(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(screen.getByText("Login failed")).toBeTruthy();
    });
  });
});
