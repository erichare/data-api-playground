// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaygroundConnection } from "./usePlaygroundConnection";

describe("usePlaygroundConnection", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    document.documentElement.className = "";

    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(key);
        }),
      },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("does not rerun bootstrap work when toggling the theme", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/astra-status") {
        return {
          json: async () => ({
            hasToken: false,
            hasEndpoint: false,
          }),
        } as Response;
      }

      throw new Error(`Unhandled fetch: ${String(input)}`);
    });

    global.fetch = fetchMock as typeof fetch;

    const bootstrapConversations = vi.fn().mockResolvedValue("conv-1");
    const resetConversationTracking = vi.fn();

    const { result } = renderHook(() =>
      usePlaygroundConnection({
        bootstrapConversations,
        resetConversationTracking,
      })
    );

    await waitFor(() => {
      expect(result.current.initializing).toBe(false);
    });

    expect(bootstrapConversations).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current.toggleTheme();
    });

    await waitFor(() => {
      expect(result.current.theme).toBe("light");
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(bootstrapConversations).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
