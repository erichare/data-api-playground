// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CopyButton,
  HighlightedCode,
  HighlightedJson,
} from "./apiExplorerPresentation";

describe("apiExplorerPresentation", () => {
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

  it("renders highlighted JSON tokens", () => {
    render(
      <pre>
        <HighlightedJson
          json={'{"name":"orders","count":3,"active":true,"nothing":null}'}
        />
      </pre>
    );

    expect(screen.getByText('"name":')).toBeTruthy();
    expect(screen.getByText('"orders"')).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("true")).toBeTruthy();
    expect(screen.getByText("null")).toBeTruthy();
  });

  it("renders highlighted code for both TypeScript and curl snippets", () => {
    const { rerender } = render(
      <pre>
        <HighlightedCode code={`const count = await col.findOne({});`} lang="ts" />
      </pre>
    );

    expect(screen.getByText("const")).toBeTruthy();
    expect(screen.getByText("await")).toBeTruthy();

    rerender(
      <pre>
        <HighlightedCode
          code={`curl -sS -X POST "$ASTRA_DB_API_ENDPOINT" -H "Token: $ASTRA_DB_APPLICATION_TOKEN"`}
          lang="curl"
        />
      </pre>
    );

    expect(screen.getByText("curl")).toBeTruthy();
    expect(screen.getByText('"$ASTRA_DB_API_ENDPOINT"')).toBeTruthy();
    expect(screen.getByText('"Token: $ASTRA_DB_APPLICATION_TOKEN"')).toBeTruthy();
  });

  it("copies text when the clipboard API is available", async () => {
    render(<CopyButton text="await col.findOne({})" />);

    fireEvent.click(screen.getByRole("button"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("await col.findOne({})");

    act(() => {
      vi.advanceTimersByTime(1800);
    });
  });

  it("does nothing when the clipboard API is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(<CopyButton text="await col.findOne({})" />);

    fireEvent.click(screen.getByRole("button"));

    expect(writeText).not.toHaveBeenCalled();
  });
});
