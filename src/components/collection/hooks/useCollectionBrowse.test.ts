// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCollectionBrowse } from "./useCollectionBrowse";
import type { Collection, CollectionDocument } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeCollection = (overrides: Partial<Collection> = {}): Collection => ({
  name: "test-col",
  count: 0,
  vectorDim: null,
  ...overrides,
});

const makeDocs = (n: number): CollectionDocument[] =>
  Array.from({ length: n }, (_, i) => ({ _id: `doc-${i}`, value: i }));

function makeFetchMock(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === "/api/browse") {
      return {
        ok: true,
        json: async () => ({
          documents: makeDocs(3),
          nextPageState: null,
          ...overrides,
        }),
      } as Response;
    }

    if (url === "/api/count") {
      return {
        ok: true,
        json: async () => ({ count: 42 }),
      } as Response;
    }

    if (url === "/api/delete-documents") {
      return {
        ok: true,
        json: async () => ({ deletedCount: 1 }),
      } as Response;
    }

    throw new Error(`Unhandled fetch: ${url}`);
  });
}

const DEFAULT_ARGS = {
  collection: makeCollection(),
  astraToken: "tok",
  astraEndpoint: "https://db.example.com",
  keyspace: "default_keyspace",
  isConnected: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useCollectionBrowse", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // Initial state — not connected
  // -------------------------------------------------------------------------

  it("returns safe initial state when isConnected is false", () => {
    global.fetch = vi.fn() as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse({
        ...DEFAULT_ARGS,
        isConnected: false,
      })
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.displayDocs).toEqual([]);
    expect(result.current.page).toBe(0);
    expect(result.current.fetchError).toBe("");
    expect(result.current.sort).toBeNull();
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.deleting).toBe(false);
    expect(result.current.deleteError).toBe("");
    // fetch should never be called when not connected
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Fetching documents on mount
  // -------------------------------------------------------------------------

  it("fetches documents when isConnected is true", async () => {
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.displayDocs).toHaveLength(3);
    expect(result.current.fetchError).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/browse",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sets loading to true while fetching and false after", async () => {
    let resolveJson!: (v: unknown) => void;
    const pendingJson = new Promise((res) => { resolveJson = res; });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/browse") {
        return {
          ok: true,
          json: () => pendingJson,
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({ count: 0 }) } as Response;
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    // loading should be set to true by the effect before the fetch resolves
    expect(result.current.loading).toBe(true);

    act(() => {
      resolveJson({ documents: makeDocs(2), nextPageState: null });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.displayDocs).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Error states
  // -------------------------------------------------------------------------

  it("sets fetchError when the response is not ok", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/browse") {
        return {
          ok: false,
          json: async () => ({ error: "Unauthorized" }),
        } as Response;
      }
      return { ok: true, json: async () => ({ count: 0 }) } as Response;
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.fetchError).toBe("Unauthorized");
    expect(result.current.displayDocs).toHaveLength(0);
  });

  it("sets fetchError when fetch rejects (network error)", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/browse") {
        throw new Error("Network failure");
      }
      return { ok: true, json: async () => ({ count: 0 }) } as Response;
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.fetchError).toBe("Network failure");
  });

  it("sets fetchError when response body contains an error field", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/browse") {
        return {
          ok: true,
          json: async () => ({ error: "Server exploded" }),
        } as Response;
      }
      return { ok: true, json: async () => ({ count: 0 }) } as Response;
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.fetchError).toBe("Server exploded");
  });

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  it("tracks nextPageState and availablePages when server returns one", async () => {
    global.fetch = makeFetchMock({ nextPageState: "page-token-abc" }) as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isLastKnownPage).toBe(false);
    expect(result.current.availablePages).toBe(2); // page 0 + 1 next
  });

  it("handlePageChange fetches the next page using the stored pageState", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/browse") {
        return {
          ok: true,
          json: async () => ({
            documents: makeDocs(3),
            nextPageState: "next-token",
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ count: 10 }) } as Response;
    }) as typeof fetch;

    global.fetch = fetchMock;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Navigate to page 1
    act(() => {
      result.current.handlePageChange(1);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.page).toBe(1);
    });

    const browseCalls = fetchMock.mock.calls.filter(
      ([url]: [string]) => String(url) === "/api/browse"
    );
    expect(browseCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("isLastKnownPage is true when nextPageState is null", async () => {
    global.fetch = makeFetchMock({ nextPageState: null }) as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isLastKnownPage).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------

  it("handleSortColumn sets ascending sort on first call", async () => {
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleSortColumn("name");
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sort).toEqual({ col: "name", dir: 1 });
    expect(result.current.page).toBe(0);
  });

  it("handleSortColumn toggles to descending on second call for same column", async () => {
    global.fetch = makeFetchMock() as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.handleSortColumn("name"); });
    await waitFor(() => expect(result.current.sort?.dir).toBe(1));

    act(() => { result.current.handleSortColumn("name"); });
    await waitFor(() => expect(result.current.sort?.dir).toBe(-1));
  });

  it("handleSortColumn clears sort on third call for same column", async () => {
    global.fetch = makeFetchMock() as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.handleSortColumn("name"); });
    await waitFor(() => expect(result.current.sort?.dir).toBe(1));

    act(() => { result.current.handleSortColumn("name"); });
    await waitFor(() => expect(result.current.sort?.dir).toBe(-1));

    act(() => { result.current.handleSortColumn("name"); });
    await waitFor(() => expect(result.current.sort).toBeNull());
  });

  it("handleSortColumn ignores $vector column", async () => {
    global.fetch = makeFetchMock() as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.handleSortColumn("$vector"); });

    // sort should remain null — $vector is a no-op
    expect(result.current.sort).toBeNull();
  });

  it("handleSortColumn resets to ascending when switching to a different column", async () => {
    global.fetch = makeFetchMock() as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.handleSortColumn("name"); });
    await waitFor(() => expect(result.current.sort?.col).toBe("name"));

    act(() => { result.current.handleSortColumn("age"); });
    await waitFor(() => expect(result.current.sort).toEqual({ col: "age", dir: 1 }));
  });

  // -------------------------------------------------------------------------
  // handleRefresh
  // -------------------------------------------------------------------------

  it("handleRefresh re-fetches the current page", async () => {
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = fetchMock.mock.calls.filter(
      ([url]: [string]) => String(url) === "/api/browse"
    ).length;

    act(() => { result.current.handleRefresh(); });

    await waitFor(() => expect(result.current.isRefreshing).toBe(false));

    const callsAfter = fetchMock.mock.calls.filter(
      ([url]: [string]) => String(url) === "/api/browse"
    ).length;

    expect(callsAfter).toBe(callsBefore + 1);
  });

  // -------------------------------------------------------------------------
  // Selection — handleToggleSelect, handleSelectAll, handleClearSelection
  // -------------------------------------------------------------------------

  it("handleToggleSelect adds and removes document IDs from selection", async () => {
    global.fetch = makeFetchMock() as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;

    act(() => { result.current.handleToggleSelect("doc-0", fakeEvent); });
    expect(result.current.selectedIds.has("doc-0")).toBe(true);

    act(() => { result.current.handleToggleSelect("doc-0", fakeEvent); });
    expect(result.current.selectedIds.has("doc-0")).toBe(false);
  });

  it("handleSelectAll selects all docs when none are selected, and clears if all selected", async () => {
    global.fetch = makeFetchMock() as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;

    act(() => { result.current.handleSelectAll(fakeEvent); });
    expect(result.current.selectedIds.size).toBe(3); // 3 docs were loaded

    act(() => { result.current.handleSelectAll(fakeEvent); });
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("handleClearSelection empties the selection set", async () => {
    global.fetch = makeFetchMock() as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;

    act(() => { result.current.handleToggleSelect("doc-0", fakeEvent); });
    expect(result.current.selectedIds.size).toBe(1);

    act(() => { result.current.handleClearSelection(); });
    expect(result.current.selectedIds.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // handleDelete
  // -------------------------------------------------------------------------

  it("handleDelete calls /api/delete-documents and refetches page", async () => {
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Select a document first
    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    act(() => { result.current.handleToggleSelect("doc-0", fakeEvent); });

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/delete-documents",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.deleteError).toBe("");
  });

  it("handleDelete sets deleteError on failure", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/browse") {
        return { ok: true, json: async () => ({ documents: makeDocs(2), nextPageState: null }) } as Response;
      }
      if (url === "/api/count") {
        return { ok: true, json: async () => ({ count: 2 }) } as Response;
      }
      if (url === "/api/delete-documents") {
        return { ok: false, json: async () => ({ error: "Delete failed" }) } as Response;
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    act(() => { result.current.handleToggleSelect("doc-0", fakeEvent); });

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(result.current.deleteError).toBe("Delete failed");
    expect(result.current.deleting).toBe(false);
  });

  it("handleDelete is a no-op when nothing is selected", async () => {
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = fetchMock.mock.calls.length;

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("handleDelete is a no-op when not connected", async () => {
    const fetchMock = vi.fn() as typeof fetch;
    global.fetch = fetchMock;

    const { result } = renderHook(() =>
      useCollectionBrowse({ ...DEFAULT_ARGS, isConnected: false })
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // onCountChange callback
  // -------------------------------------------------------------------------

  it("calls onCountChange with the count returned from /api/count", async () => {
    global.fetch = makeFetchMock() as typeof fetch;

    const onCountChange = vi.fn();

    const { result } = renderHook(() =>
      useCollectionBrowse({ ...DEFAULT_ARGS, onCountChange })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(onCountChange).toHaveBeenCalledWith("test-col", 42);
  });

  // -------------------------------------------------------------------------
  // Computed values: inferredTotal, startRow, endRow, columns
  // -------------------------------------------------------------------------

  it("computes startRow and endRow correctly on page 0", async () => {
    global.fetch = makeFetchMock() as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // PAGE_SIZE = 10; page = 0; docs = 3
    expect(result.current.startRow).toBe(1);
    expect(result.current.endRow).toBe(3);
  });

  it("derives columns from returned documents", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/browse") {
        return {
          ok: true,
          json: async () => ({
            documents: [{ _id: "a", name: "Alice", age: 30 }],
            nextPageState: null,
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ count: 1 }) } as Response;
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // getColumns sorts: _id first, $vector last, others alphabetical
    expect(result.current.columns[0]).toBe("_id");
    expect(result.current.columns).toContain("age");
    expect(result.current.columns).toContain("name");
  });

  it("knownTotal is null when collection.count is 0", async () => {
    global.fetch = makeFetchMock() as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse({
        ...DEFAULT_ARGS,
        collection: makeCollection({ count: 0 }),
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.knownTotal).toBeNull();
  });

  it("knownTotal reflects collection.count when positive", async () => {
    global.fetch = makeFetchMock() as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse({
        ...DEFAULT_ARGS,
        collection: makeCollection({ count: 500 }),
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.knownTotal).toBe(500);
  });

  // -------------------------------------------------------------------------
  // __vector_ placeholder expansion
  // -------------------------------------------------------------------------

  it("expands __vector_ placeholder strings into zero-filled arrays", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/browse") {
        return {
          ok: true,
          json: async () => ({
            documents: [{ _id: "v1", $vector: "__vector_4__" }],
            nextPageState: null,
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ count: 0 }) } as Response;
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useCollectionBrowse(DEFAULT_ARGS)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const doc = result.current.displayDocs[0];
    expect(Array.isArray(doc.$vector)).toBe(true);
    expect((doc.$vector as number[]).length).toBe(4);
    expect((doc.$vector as number[]).every((v) => v === 0)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Re-fetch on collection.name change
  // -------------------------------------------------------------------------

  it("re-fetches when collection.name changes", async () => {
    const fetchMock = makeFetchMock();
    global.fetch = fetchMock as typeof fetch;

    const { result, rerender } = renderHook(
      ({ col }: { col: Collection }) =>
        useCollectionBrowse({ ...DEFAULT_ARGS, collection: col }),
      { initialProps: { col: makeCollection({ name: "col-a" }) } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = fetchMock.mock.calls.filter(
      ([url]: [string]) => String(url) === "/api/browse"
    ).length;

    rerender({ col: makeCollection({ name: "col-b" }) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsAfter = fetchMock.mock.calls.filter(
      ([url]: [string]) => String(url) === "/api/browse"
    ).length;

    expect(callsAfter).toBeGreaterThan(callsBefore);
  });
});
