// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaygroundConnection } from "./usePlaygroundConnection";

describe("usePlaygroundConnection", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("bootstraps conversations and reads Astra env status on mount", async () => {
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
    expect(result.current.envReady).toBe(false);
  });
});
