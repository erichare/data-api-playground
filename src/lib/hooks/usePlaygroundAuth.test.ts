// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaygroundAuth } from "./usePlaygroundAuth";

describe("usePlaygroundAuth", () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/auth/status") {
        return {
          json: async () => ({ enabled: true }),
        } as Response;
      }

      if (String(input) === "/api/auth/logout" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ authenticated: false }),
        } as Response;
      }

      throw new Error(`Unhandled fetch: ${String(input)}`);
    }) as typeof fetch;

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "http://localhost/" },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("loads auth status and signs the user out", async () => {
    const { result } = renderHook(() => usePlaygroundAuth());

    await waitFor(() => {
      expect(result.current.authEnabled).toBe(true);
    });

    await act(async () => {
      await result.current.handleSignOut();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
    });
    expect(window.location.href).toBe("/login");
  });
});
