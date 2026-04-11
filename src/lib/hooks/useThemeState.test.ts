// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeState } from "./useThemeState";

describe("useThemeState", () => {
  beforeEach(() => {
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

  it("applies the active theme to the document and persists toggles", async () => {
    const { result } = renderHook(() => useThemeState());

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    act(() => {
      result.current.toggleTheme();
    });

    await waitFor(() => {
      expect(result.current.theme).toBe("light");
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.setItem).toHaveBeenCalledWith("theme", "light");
  });
});
