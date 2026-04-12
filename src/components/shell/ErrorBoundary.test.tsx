// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

// A component that throws synchronously during render so we can trigger the
// error boundary in tests.
function BombComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test explosion");
  }
  return <div>Normal child content</div>;
}

// React prints caught errors to console.error even when an error boundary
// handles them.  Suppress that noise so test output stays clean.
function suppressReactErrorOutput() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  return spy;
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("happy path – no error", () => {
    it("renders children when no error is thrown", () => {
      render(
        <ErrorBoundary>
          <div data-testid="child">Hello world</div>
        </ErrorBoundary>
      );

      expect(screen.getByTestId("child").textContent).toBe("Hello world");
      expect(screen.queryByText("Something went wrong")).toBeNull();
    });

    it("renders multiple children without error", () => {
      render(
        <ErrorBoundary>
          <span data-testid="child-a">A</span>
          <span data-testid="child-b">B</span>
        </ErrorBoundary>
      );

      expect(screen.getByTestId("child-a")).toBeTruthy();
      expect(screen.getByTestId("child-b")).toBeTruthy();
    });
  });

  describe("error state – default fallback UI", () => {
    beforeEach(() => {
      suppressReactErrorOutput();
    });

    it("renders the default fallback UI when a child throws", () => {
      render(
        <ErrorBoundary>
          <BombComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText("Something went wrong")).toBeTruthy();
    });

    it("displays the thrown error message in the fallback UI", () => {
      render(
        <ErrorBoundary>
          <BombComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText("Test explosion")).toBeTruthy();
    });

    it("shows a fallback message when the error has no message property", () => {
      function NoMessageError(): React.ReactNode {
        // Throw an Error with an empty string so error.message is falsy.
        throw new Error("");
      }

      render(
        <ErrorBoundary>
          <NoMessageError />
        </ErrorBoundary>
      );

      expect(screen.getByText("An unexpected error occurred.")).toBeTruthy();
    });

    it("renders the 'Try again' button in the fallback UI", () => {
      render(
        <ErrorBoundary>
          <BombComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    });

    it("clicking 'Try again' resets state and re-renders children", () => {
      // Use a ref-controlled flag so we can flip shouldThrow to false before
      // the "Try again" click triggers a re-render of the boundary's children.
      let shouldThrow = true;

      function ControlledBomb() {
        if (shouldThrow) throw new Error("Test explosion");
        return <div>Normal child content</div>;
      }

      const { rerender } = render(
        <ErrorBoundary>
          <ControlledBomb />
        </ErrorBoundary>
      );

      // Error UI should be visible.
      expect(screen.getByText("Something went wrong")).toBeTruthy();

      // Stop the child from throwing before the boundary resets and re-renders.
      shouldThrow = false;

      // Clicking "Try again" calls setState({ hasError: false, error: null }),
      // which triggers a re-render that will now render the healthy child.
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));

      // Force a new render cycle so the boundary picks up the child change.
      rerender(
        <ErrorBoundary>
          <ControlledBomb />
        </ErrorBoundary>
      );

      expect(screen.getByText("Normal child content")).toBeTruthy();
      expect(screen.queryByText("Something went wrong")).toBeNull();
    });
  });

  describe("error state – custom fallback prop", () => {
    beforeEach(() => {
      suppressReactErrorOutput();
    });

    it("renders the custom fallback when provided and a child throws", () => {
      render(
        <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom error UI</div>}>
          <BombComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId("custom-fallback")).toBeTruthy();
      expect(screen.queryByText("Something went wrong")).toBeNull();
    });

    it("does not render children when using a custom fallback after an error", () => {
      render(
        <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom error UI</div>}>
          <BombComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      // The child should not be in the DOM.
      expect(screen.queryByText("Normal child content")).toBeNull();
    });
  });

  describe("componentDidCatch", () => {
    it("calls console.error with the error and component stack when a child throws", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <BombComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      // Find the call that matches the ErrorBoundary's own console.error call.
      // React may emit its own console.error calls as well; we look for the one
      // that starts with "[ErrorBoundary]".
      const boundaryCall = consoleSpy.mock.calls.find(
        (args) => typeof args[0] === "string" && args[0] === "[ErrorBoundary]"
      );

      expect(boundaryCall).toBeDefined();

      // Second argument should be the thrown Error instance.
      expect(boundaryCall![1]).toBeInstanceOf(Error);
      expect((boundaryCall![1] as Error).message).toBe("Test explosion");

      // Third argument is the component stack string from ErrorInfo.
      expect(typeof boundaryCall![2]).toBe("string");
    });
  });
});
