// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentChunks } from "./useDocumentChunks";
import type { IngestedDocumentSummary } from "@/lib/types";

const mockDoc: IngestedDocumentSummary = {
  source_doc_id: "doc-123",
  source_filename: "test.pdf",
  file_type: "pdf",
  file_size: 1024,
  content_hash: "abc123",
  chunk_total: 3,
  ingested_at: "2024-01-01T00:00:00Z",
  collection: "my-collection",
};

const defaultArgs = {
  doc: mockDoc,
  astraToken: "test-token",
  astraEndpoint: "https://test.endpoint.com",
  keyspace: "test-keyspace",
  isConnected: true,
};

describe("useDocumentChunks", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    // Stub clipboard API
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("starts with empty chunks and loading=true when connected", async () => {
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ chunks: [] }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentChunks(defaultArgs));

      expect(result.current.chunks).toEqual([]);
      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBe("");
      expect(result.current.copied).toBe(false);

      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it("starts with loading=false when not connected", () => {
      const { result } = renderHook(() =>
        useDocumentChunks({ ...defaultArgs, isConnected: false })
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.chunks).toEqual([]);
    });
  });

  describe("data loading", () => {
    it("fetches chunks with correct POST body on mount", async () => {
      const mockChunks = [
        { chunk_index: 0, content: "First chunk" },
        { chunk_index: 1, content: "Second chunk" },
      ];

      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ chunks: mockChunks }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentChunks(defaultArgs));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(fetch).toHaveBeenCalledWith("/api/documents/chunks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_doc_id: mockDoc.source_doc_id,
          collection: mockDoc.collection,
          token: defaultArgs.astraToken,
          endpoint: defaultArgs.astraEndpoint,
          keyspace: defaultArgs.keyspace,
        }),
      });

      expect(result.current.chunks).toEqual(mockChunks);
    });

    it("sets chunks to empty array when response has no chunks field", async () => {
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentChunks(defaultArgs));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.chunks).toEqual([]);
    });

    it("does not fetch when isConnected is false", () => {
      renderHook(() =>
        useDocumentChunks({ ...defaultArgs, isConnected: false })
      );

      expect(fetch).not.toHaveBeenCalled();
    });

    it("computes fullText by joining chunk content with double newlines", async () => {
      const mockChunks = [
        { chunk_index: 0, content: "Hello" },
        { chunk_index: 1, content: "World" },
      ];

      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ chunks: mockChunks }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentChunks(defaultArgs));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // fullText is internal but we verify copyAll uses it (clipboard will have joined text)
      act(() => {
        result.current.copyAll();
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Hello\n\nWorld");
    });

    it("supports HCD connections when an explicit backend connection is provided", async () => {
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ chunks: [] }),
      } as unknown as Response);

      renderHook(() =>
        useDocumentChunks({
          ...defaultArgs,
          connection: {
            backend: "hcd",
            endpoint: "https://hcd.example.com:8181",
            username: "cassandra",
            password: "secret",
          },
          astraToken: undefined,
          astraEndpoint: undefined,
        })
      );

      await waitFor(() => expect(fetch).toHaveBeenCalled());

      expect(fetch).toHaveBeenCalledWith("/api/documents/chunks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_doc_id: mockDoc.source_doc_id,
          collection: mockDoc.collection,
          backend: "hcd",
          endpoint: "https://hcd.example.com:8181",
          username: "cassandra",
          password: "secret",
          keyspace: defaultArgs.keyspace,
        }),
      });
    });

    it("omits backend credentials when neither an explicit connection nor Astra creds are present", async () => {
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ chunks: [] }),
      } as unknown as Response);

      renderHook(() =>
        useDocumentChunks({
          ...defaultArgs,
          connection: null,
          astraToken: undefined,
          astraEndpoint: undefined,
        })
      );

      await waitFor(() => expect(fetch).toHaveBeenCalled());

      expect(fetch).toHaveBeenCalledWith("/api/documents/chunks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_doc_id: mockDoc.source_doc_id,
          collection: mockDoc.collection,
          keyspace: defaultArgs.keyspace,
        }),
      });
    });
  });

  describe("error handling", () => {
    it("sets error when API returns an error field", async () => {
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ error: "Not found" }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentChunks(defaultArgs));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe("Not found");
      expect(result.current.chunks).toEqual([]);
    });

    it("sets generic error message when fetch throws a non-Error", async () => {
      vi.mocked(fetch).mockRejectedValue("network failure");

      const { result } = renderHook(() => useDocumentChunks(defaultArgs));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe("Failed to load");
    });

    it("sets error message from Error instance when fetch throws", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("Connection refused"));

      const { result } = renderHook(() => useDocumentChunks(defaultArgs));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe("Connection refused");
    });

    it("sets loading to false even after an error", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("fail"));

      const { result } = renderHook(() => useDocumentChunks(defaultArgs));

      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });

  describe("copyAll", () => {
    it("sets copied=true after calling copyAll", async () => {
      // Fetch resolves before fake timers are installed
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ chunks: [{ chunk_index: 0, content: "text" }] }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentChunks(defaultArgs));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Install fake timers only after the hook has finished loading
      vi.useFakeTimers();

      await act(async () => {
        result.current.copyAll();
        // Allow the clipboard promise microtask to flush
        await Promise.resolve();
      });

      expect(result.current.copied).toBe(true);

      act(() => {
        vi.advanceTimersByTime(2001);
      });

      expect(result.current.copied).toBe(false);

      vi.useRealTimers();
    });

    it("calls clipboard.writeText with empty string when no chunks", async () => {
      vi.mocked(fetch).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ chunks: [] }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentChunks(defaultArgs));

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        result.current.copyAll();
        await Promise.resolve();
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("");
    });
  });

  describe("re-fetch on dependency change", () => {
    it("re-fetches when doc changes", async () => {
      vi.mocked(fetch)
        .mockResolvedValue({
          json: vi.fn().mockResolvedValue({ chunks: [] }),
        } as unknown as Response)
        .mockResolvedValue({
          json: vi.fn().mockResolvedValue({ chunks: [] }),
        } as unknown as Response);

      const { result, rerender } = renderHook(
        (props) => useDocumentChunks(props),
        { initialProps: defaultArgs }
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThanOrEqual(1);

      const newDoc = { ...mockDoc, source_doc_id: "doc-456" };
      rerender({ ...defaultArgs, doc: newDoc });

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    });
  });
});
