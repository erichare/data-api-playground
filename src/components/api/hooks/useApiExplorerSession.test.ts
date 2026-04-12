// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApiExplorerSession } from "./useApiExplorerSession";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
    ...init,
  });
}

function makeCollection(overrides: Partial<{
  name: string;
  count: number;
  vectorDim: number | null;
  vectorizeService: { provider: string; modelName: string } | null;
}> = {}) {
  return {
    name: "orders",
    count: 10,
    vectorDim: 3,
    vectorizeService: null,
    ...overrides,
  };
}

describe("useApiExplorerSession", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "setInterval").mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("loads the client-call history on mount", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        calls: [
          {
            id: "call-1",
            label: 'db.collection("orders").findOne',
            code: "await col.findOne({})",
            timestamp: "2026-04-11T12:34:56.000Z",
          },
        ],
      })
    );
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useApiExplorerSession({
        collection: makeCollection(),
        astraToken: "AstraCS:secret",
        astraEndpoint: "https://db.apps.astra.datastax.com",
        keyspace: "default_keyspace",
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/typescript-client-calls?limit=40");
    });

    await act(async () => {
      await result.current.refreshClientCalls();
    });

    expect(result.current.clientCalls).toHaveLength(1);
    expect(result.current.clientCallsLoading).toBe(false);
    expect(result.current.clientCalls).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith("/api/typescript-client-calls?limit=40");
  });

  it("resets request state when switching operations", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ calls: [] }));
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useApiExplorerSession({
        collection: makeCollection(),
        astraToken: "AstraCS:secret",
        astraEndpoint: "https://db.apps.astra.datastax.com",
        keyspace: "default_keyspace",
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.updateBody("{");
      result.current.selectOp("estimatedCount");
    });

    expect(result.current.body).toContain('"estimatedDocumentCount"');
    expect(result.current.bodyError).toBe("");
    expect(result.current.selectedOp).toBe("estimatedCount");
  });

  it("shows a validation error and skips the proxy request for invalid JSON", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ calls: [] }));
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useApiExplorerSession({
        collection: makeCollection(),
        astraToken: "AstraCS:secret",
        astraEndpoint: "https://db.apps.astra.datastax.com",
        keyspace: "default_keyspace",
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.updateBody("{");
    });

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.bodyError).toBe("Invalid JSON");
    const proxyCalls = (fetchMock.mock.calls as unknown as [string, ...unknown[]][]).filter(
      ([url]) => String(url) === "/api/data-api-proxy"
    );
    expect(proxyCalls).toHaveLength(0);
  });

  it("runs requests and refreshes the TypeScript client log", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => jsonResponse({ calls: [] }))
      .mockImplementationOnce(async () =>
        jsonResponse({
          status: 200,
          statusText: "OK",
          latencyMs: 12,
          data: { ok: true },
        })
      )
      .mockImplementationOnce(async () =>
        jsonResponse({
          calls: [
            {
              id: "call-1",
              label: 'db.collection("orders").findOne',
              code: "await col.findOne({})",
              timestamp: "2026-04-11T12:34:56.000Z",
            },
          ],
        })
      );
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() =>
      useApiExplorerSession({
        collection: makeCollection(),
        astraToken: "AstraCS:secret",
        astraEndpoint: "https://db.apps.astra.datastax.com",
        keyspace: "default_keyspace",
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.selectOp("findOne");
    });

    await act(async () => {
      await result.current.run();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/data-api-proxy",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          token: "AstraCS:secret",
          endpoint: "https://db.apps.astra.datastax.com",
          keyspace: "default_keyspace",
          collection: "orders",
          requestBody: { findOne: { filter: {} } },
        }),
      }),
    ]);
    expect(result.current.response).toEqual({
      status: 200,
      statusText: "OK",
      latencyMs: 12,
      data: { ok: true },
    });
    expect(result.current.clientCalls).toHaveLength(1);
  });
});
