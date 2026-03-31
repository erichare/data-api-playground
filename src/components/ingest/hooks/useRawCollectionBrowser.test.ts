// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRawCollectionBrowser } from "./useRawCollectionBrowser";

const defaultArgs = {
  isConnected: true,
  selectedCollection: "test-col",
  astraToken: "token",
  astraEndpoint: "https://endpoint.com",
  keyspace: "ks",
};

const mockDocs = [
  { _id: "1", name: "Alice" },
  { _id: "2", name: "Bob" },
];

describe("useRawCollectionBrowser", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("starts with correct defaults", () => {
      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      expect(result.current.rawOpen).toBe(false);
      expect(result.current.rawDocs).toEqual([]);
      expect(result.current.loadingRaw).toBe(false);
      expect(result.current.rawError).toBe("");
      expect(result.current.rawPageState).toBeNull();
      expect(result.current.rawPageIndex).toBe(0);
    });

    it("does not auto-fetch when rawOpen is false", () => {
      renderHook(() => useRawCollectionBrowser(defaultArgs));
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("setRawOpen", () => {
    it("triggers loadRawDocs when rawOpen becomes true and connected", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ documents: mockDocs, nextPageState: null }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      act(() => {
        result.current.setRawOpen(true);
      });

      await waitFor(() => expect(result.current.loadingRaw).toBe(false));

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.current.rawDocs).toEqual(mockDocs);
    });

    it("does not fetch when rawOpen becomes true but not connected", () => {
      const { result } = renderHook(() =>
        useRawCollectionBrowser({ ...defaultArgs, isConnected: false })
      );

      act(() => {
        result.current.setRawOpen(true);
      });

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("loadRawDocs", () => {
    it("posts correct body to /api/browse", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ documents: [], nextPageState: null }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(fetch).toHaveBeenCalledWith("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "token",
          endpoint: "https://endpoint.com",
          keyspace: "ks",
          collection: "test-col",
          pageState: null,
        }),
      });
    });

    it("does nothing when not connected", async () => {
      const { result } = renderHook(() =>
        useRawCollectionBrowser({ ...defaultArgs, isConnected: false })
      );

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(fetch).not.toHaveBeenCalled();
    });

    it("sets rawDocs and rawPageState from response", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          documents: mockDocs,
          nextPageState: "page-token-abc",
        }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(result.current.rawDocs).toEqual(mockDocs);
      expect(result.current.rawPageState).toBe("page-token-abc");
    });

    it("sets rawDocs to empty array when documents field is missing", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ nextPageState: null }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(result.current.rawDocs).toEqual([]);
    });

    it("sets rawPageState to null when nextPageState is absent", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ documents: [] }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(result.current.rawPageState).toBeNull();
    });

    it("sets rawError when response has error field", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ error: "Forbidden" }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(result.current.rawError).toBe("Forbidden");
    });

    it("sets rawError when fetch throws an Error", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Connection refused"));

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(result.current.rawError).toBe("Connection refused");
    });

    it("sets generic rawError for non-Error throws", async () => {
      vi.mocked(fetch).mockRejectedValueOnce("unexpected");

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(result.current.rawError).toBe("Failed to load");
    });

    it("sets loadingRaw to false after success", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ documents: [] }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(result.current.loadingRaw).toBe(false);
    });

    it("sets loadingRaw to false after error", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("fail"));

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(result.current.loadingRaw).toBe(false);
    });

    it("passes pageState to /api/browse", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ documents: [], nextPageState: null }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs("cursor-xyz");
      });

      const callBody = JSON.parse(
        (vi.mocked(fetch).mock.calls[0][1]?.body as string) ?? "{}"
      );
      expect(callBody.pageState).toBe("cursor-xyz");
    });

    it("clears rawError on each new load call", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("First error"));

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(result.current.rawError).toBe("First error");

      vi.mocked(fetch).mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ documents: mockDocs }),
      } as unknown as Response);

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(result.current.rawError).toBe("");
    });
  });

  describe("resetAndLoadFirstPage", () => {
    it("resets page history and index, then loads first page", async () => {
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ documents: mockDocs, nextPageState: "p2" }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      // Simulate having navigated to page 2
      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      act(() => {
        result.current.goToNextPage();
      });

      await waitFor(() => expect(result.current.rawPageIndex).toBe(1));

      // Reset
      await act(async () => {
        result.current.resetAndLoadFirstPage();
        await Promise.resolve();
      });

      expect(result.current.rawPageIndex).toBe(0);
    });
  });

  describe("pagination", () => {
    it("goToNextPage increments page index and records page state in history", async () => {
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ documents: mockDocs, nextPageState: "next-cursor" }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      // Load first page
      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      expect(result.current.rawPageState).toBe("next-cursor");

      act(() => {
        result.current.goToNextPage();
      });

      await waitFor(() => expect(result.current.rawPageIndex).toBe(1));

      // Should have fetched with the cursor from page 1
      const lastCall = vi.mocked(fetch).mock.calls.at(-1);
      const body = JSON.parse((lastCall?.[1]?.body as string) ?? "{}");
      expect(body.pageState).toBe("next-cursor");
    });

    it("goToPreviousPage decrements page index and loads previous cursor", async () => {
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ documents: mockDocs, nextPageState: "cursor-2" }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      // Load first page (index 0, null cursor)
      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      // Go to next page (index 1)
      act(() => {
        result.current.goToNextPage();
      });

      await waitFor(() => expect(result.current.rawPageIndex).toBe(1));

      // Now go back (index 0)
      act(() => {
        result.current.goToPreviousPage();
      });

      await waitFor(() => expect(result.current.rawPageIndex).toBe(0));

      // The previous page (index 0) had null as its cursor
      const lastCall = vi.mocked(fetch).mock.calls.at(-1);
      const body = JSON.parse((lastCall?.[1]?.body as string) ?? "{}");
      expect(body.pageState).toBeNull();
    });

    it("goToNextPage reuses existing page history entry when available", async () => {
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ documents: [], nextPageState: "cursor-3" }),
      } as unknown as Response);

      const { result } = renderHook(() => useRawCollectionBrowser(defaultArgs));

      await act(async () => {
        await result.current.loadRawDocs(null);
      });

      // Navigate forward then backward then forward again
      act(() => { result.current.goToNextPage(); });
      await waitFor(() => expect(result.current.rawPageIndex).toBe(1));

      act(() => { result.current.goToPreviousPage(); });
      await waitFor(() => expect(result.current.rawPageIndex).toBe(0));

      const callCountBefore = vi.mocked(fetch).mock.calls.length;

      act(() => { result.current.goToNextPage(); });
      await waitFor(() => expect(result.current.rawPageIndex).toBe(1));

      // Should still have fetched (history entry was already set)
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });

  describe("selectedCollection change", () => {
    it("reloads when rawOpen is true and selectedCollection changes", async () => {
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ documents: [], nextPageState: null }),
      } as unknown as Response);

      const { result, rerender } = renderHook(
        (props) => useRawCollectionBrowser(props),
        { initialProps: defaultArgs }
      );

      act(() => {
        result.current.setRawOpen(true);
      });

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      rerender({ ...defaultArgs, selectedCollection: "col2" });

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

      const lastBody = JSON.parse(
        (vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body as string) ?? "{}"
      );
      expect(lastBody.collection).toBe("col2");
    });
  });
});
