// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentLibrary } from "./useDocumentLibrary";
import type { IngestedDocumentSummary } from "@/lib/types";

// Mock ingestShared so getMockDocuments is controlled
vi.mock("@/components/ingest/ingestShared", () => ({
  getMockDocuments: vi.fn((collection: string) => [
    {
      source_doc_id: "mock-1",
      source_filename: "mock.pdf",
      file_type: "pdf",
      file_size: 512,
      content_hash: "mock-hash",
      chunk_total: 2,
      ingested_at: "2024-01-01T00:00:00Z",
      collection,
    },
  ]),
}));

const makeDoc = (id: string, collection = "col1"): IngestedDocumentSummary => ({
  source_doc_id: id,
  source_filename: `${id}.pdf`,
  file_type: "pdf",
  file_size: 1024,
  content_hash: "hash",
  chunk_total: 1,
  ingested_at: "2024-01-01T00:00:00Z",
  collection,
});

const defaultArgs = {
  isConnected: true,
  selectedCollection: "col1",
  astraToken: "token",
  astraEndpoint: "https://endpoint.com",
  keyspace: "ks",
};

describe("useDocumentLibrary", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("starts with empty documents and loadingDocs=false before fetch resolves", () => {
      vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {})); // never resolves

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      expect(result.current.documents).toEqual([]);
      expect(result.current.search).toBe("");
      expect(result.current.filterType).toBe("all");
      expect(result.current.deletingId).toBeNull();
      expect(result.current.viewingDoc).toBeNull();
      expect(result.current.loadError).toBe("");
    });

    it("loads mock documents when not connected", async () => {
      const { result } = renderHook(() =>
        useDocumentLibrary({ ...defaultArgs, isConnected: false })
      );

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      expect(result.current.documents).toHaveLength(1);
      expect(result.current.documents[0].source_doc_id).toBe("mock-1");
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("loadDocuments (connected)", () => {
    it("fetches documents from API with correct collection param", async () => {
      const docs = [makeDoc("doc-1"), makeDoc("doc-2")];
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ documents: docs }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      expect(fetch).toHaveBeenCalledWith("/api/documents?collection=col1");
      expect(result.current.documents).toEqual(docs);
      expect(result.current.loadError).toBe("");
    });

    it("sets loadError when response is not ok and has error field", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "Unauthorized" }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      expect(result.current.loadError).toBe("Unauthorized");
      expect(result.current.documents).toEqual([]);
    });

    it("includes requestId in error message when present", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "Server error", requestId: "req-abc" }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      expect(result.current.loadError).toBe("Server error (request req-abc)");
    });

    it("uses default error message when error field is missing but ok is false", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      expect(result.current.loadError).toBe("Failed to load documents");
    });

    it("falls back to empty array when documents field is missing in success response", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      expect(result.current.documents).toEqual([]);
    });

    it("sets loadError on network failure", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network down"));

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      expect(result.current.loadError).toBe("Network down");
    });

    it("sets generic error message for non-Error throws", async () => {
      vi.mocked(fetch).mockRejectedValueOnce("unknown error");

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      expect(result.current.loadError).toBe("Failed to load documents");
    });
  });

  describe("filteredDocs", () => {
    it("returns all documents with no filters active", async () => {
      const docs = [makeDoc("doc-1"), makeDoc("doc-2")];
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ documents: docs }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      expect(result.current.filteredDocs).toHaveLength(2);
    });

    it("filters by search string (case-insensitive)", async () => {
      const docs = [
        { ...makeDoc("doc-1"), source_filename: "alpha.pdf" },
        { ...makeDoc("doc-2"), source_filename: "beta.pdf" },
      ];
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ documents: docs }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      act(() => {
        result.current.setSearch("ALPHA");
      });

      expect(result.current.filteredDocs).toHaveLength(1);
      expect(result.current.filteredDocs[0].source_filename).toBe("alpha.pdf");
    });

    it("filters by file type", async () => {
      const docs = [
        { ...makeDoc("doc-1"), file_type: "pdf" as const },
        { ...makeDoc("doc-2"), file_type: "txt" as const },
      ];
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ documents: docs }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      act(() => {
        result.current.setFilterType("txt");
      });

      expect(result.current.filteredDocs).toHaveLength(1);
      expect(result.current.filteredDocs[0].file_type).toBe("txt");
    });

    it("combines search and type filters", async () => {
      const docs = [
        { ...makeDoc("doc-1"), source_filename: "notes.txt", file_type: "txt" as const },
        { ...makeDoc("doc-2"), source_filename: "notes.pdf", file_type: "pdf" as const },
        { ...makeDoc("doc-3"), source_filename: "other.txt", file_type: "txt" as const },
      ];
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ documents: docs }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      act(() => {
        result.current.setSearch("notes");
        result.current.setFilterType("txt");
      });

      expect(result.current.filteredDocs).toHaveLength(1);
      expect(result.current.filteredDocs[0].source_doc_id).toBe("doc-1");
    });
  });

  describe("handleDelete", () => {
    it("removes document from state after deletion when connected", async () => {
      const docs = [makeDoc("doc-1"), makeDoc("doc-2")];
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ documents: docs }),
        } as unknown as Response)
        .mockResolvedValueOnce({ ok: true } as unknown as Response); // DELETE call

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      await act(async () => {
        await result.current.handleDelete(docs[0]);
      });

      expect(result.current.documents).toHaveLength(1);
      expect(result.current.documents[0].source_doc_id).toBe("doc-2");
      expect(result.current.deletingId).toBeNull();
    });

    it("sets deletingId to doc id during deletion", async () => {
      const docs = [makeDoc("doc-1")];
      let resolveFetch!: (value: Response) => void;
      const pendingFetch = new Promise<Response>((res) => { resolveFetch = res; });

      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ documents: docs }),
        } as unknown as Response)
        .mockReturnValueOnce(pendingFetch);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      // Start deletion but don't resolve yet
      act(() => {
        void result.current.handleDelete(docs[0]);
      });

      expect(result.current.deletingId).toBe("doc-1");

      resolveFetch({ ok: true } as unknown as Response);
      await waitFor(() => expect(result.current.deletingId).toBeNull());
    });

    it("removes document from state even when not connected", async () => {
      const { result } = renderHook(() =>
        useDocumentLibrary({ ...defaultArgs, isConnected: false })
      );

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      const docToDelete = result.current.documents[0];
      await act(async () => {
        await result.current.handleDelete(docToDelete);
      });

      expect(result.current.documents).toHaveLength(0);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("prependDocument", () => {
    it("adds document to front of list", async () => {
      const docs = [makeDoc("doc-1")];
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ documents: docs }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      act(() => {
        result.current.prependDocument(makeDoc("doc-new"));
      });

      expect(result.current.documents[0].source_doc_id).toBe("doc-new");
      expect(result.current.documents).toHaveLength(2);
    });
  });

  describe("viewingDoc", () => {
    it("can set and clear viewingDoc", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ documents: [] }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      const doc = makeDoc("doc-1");
      act(() => {
        result.current.setViewingDoc(doc);
      });

      expect(result.current.viewingDoc).toEqual(doc);

      act(() => {
        result.current.setViewingDoc(null);
      });

      expect(result.current.viewingDoc).toBeNull();
    });
  });

  describe("loadDocuments re-fetch", () => {
    it("re-fetches when selectedCollection changes", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ documents: [] }),
      } as unknown as Response);

      const { rerender } = renderHook(
        (props) => useDocumentLibrary(props),
        { initialProps: defaultArgs }
      );

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      rerender({ ...defaultArgs, selectedCollection: "col2" });

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      expect(fetch).toHaveBeenLastCalledWith("/api/documents?collection=col2");
    });
  });

  describe("document mutations", () => {
    it("replaces overwritten documents by source id while keeping the new upload at the top", async () => {
      const docs = [makeDoc("doc-1"), makeDoc("doc-2")];
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ documents: docs }),
      } as unknown as Response);

      const { result } = renderHook(() => useDocumentLibrary(defaultArgs));

      await waitFor(() => expect(result.current.loadingDocs).toBe(false));

      act(() => {
        result.current.replaceDocumentsByIds(
          {
            ...makeDoc("doc-3"),
            source_filename: "replacement.pdf",
          },
          ["doc-1"]
        );
      });

      expect(result.current.documents).toEqual([
        expect.objectContaining({
          source_doc_id: "doc-3",
          source_filename: "replacement.pdf",
        }),
        expect.objectContaining({
          source_doc_id: "doc-2",
        }),
      ]);
    });
  });
});
