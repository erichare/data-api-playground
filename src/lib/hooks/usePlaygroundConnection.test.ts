// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaygroundConnection } from "./usePlaygroundConnection";

const { fetchCollectionsFromApiMock } = vi.hoisted(() => ({
  fetchCollectionsFromApiMock: vi.fn(),
}));

vi.mock("@/lib/playground/client", () => ({
  fetchCollectionsFromApi: fetchCollectionsFromApiMock,
}));

function makeConnectionResult(overrides: Partial<Awaited<ReturnType<typeof fetchCollectionsFromApiMock>>> = {}) {
  return {
    collections: [
      { name: "dap_internal", count: 1, vectorDim: 768, vectorizeService: null },
      { name: "orders", count: 12, vectorDim: 768, vectorizeService: null },
      { name: "customers", count: 4, vectorDim: null, vectorizeService: null },
    ],
    fields: {
      orders: ["customer_id", "total"],
      customers: ["name"],
    },
    keyspaces: ["ks1", "ks2"],
    ...overrides,
  };
}

describe("usePlaygroundConnection", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
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

  it("hydrates an env-backed Astra connection when credentials exist on the server", async () => {
    fetchCollectionsFromApiMock.mockResolvedValueOnce(makeConnectionResult());

    global.fetch = vi.fn(async () => ({
      json: async () => ({
        hasToken: true,
        hasEndpoint: true,
      }),
    })) as typeof fetch;

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

    expect(fetchCollectionsFromApiMock).toHaveBeenCalledWith("", "");
    expect(result.current.envReady).toBe(true);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.astraFromEnv).toBe(true);
    expect(result.current.astraToken).toBe("");
    expect(result.current.astraEndpoint).toBe("");
    expect(result.current.activeCollection).toBe("orders");
    expect(result.current.keyspaces).toEqual(["ks1", "ks2"]);
    expect(result.current.selectedKeyspace).toBe("ks1");
  });

  it("connects with explicit credentials, trims the endpoint, and refreshes conversations", async () => {
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        hasToken: false,
        hasEndpoint: false,
      }),
    })) as typeof fetch;
    fetchCollectionsFromApiMock.mockResolvedValueOnce(
      makeConnectionResult({
        collections: [
          { name: "orders", count: 12, vectorDim: 768, vectorizeService: null },
        ],
      })
    );

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

    await act(async () => {
      await result.current.handleConnect(
        "AstraCS:secret",
        "https://db-id-us-east1.apps.astra.datastax.com/"
      );
    });

    expect(fetchCollectionsFromApiMock).toHaveBeenLastCalledWith(
      "AstraCS:secret",
      "https://db-id-us-east1.apps.astra.datastax.com/",
      undefined
    );
    expect(result.current.isConnected).toBe(true);
    expect(result.current.astraFromEnv).toBe(false);
    expect(result.current.astraToken).toBe("AstraCS:secret");
    expect(result.current.astraEndpoint).toBe(
      "https://db-id-us-east1.apps.astra.datastax.com"
    );
    expect(result.current.activeCollection).toBe("orders");
    expect(result.current.keyspaces).toEqual(["ks1", "ks2"]);
    expect(result.current.selectedKeyspace).toBe("ks1");
    expect(result.current.connectError).toBe("");
    expect(resetConversationTracking).toHaveBeenCalledTimes(1);
    expect(bootstrapConversations).toHaveBeenCalledTimes(2);
  });

  it("surfaces connection errors and preserves the failure message", async () => {
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        hasToken: false,
        hasEndpoint: false,
      }),
    })) as typeof fetch;
    fetchCollectionsFromApiMock.mockRejectedValueOnce(new Error("Connection failed hard"));

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

    await act(async () => {
      await expect(
        result.current.handleConnect("AstraCS:secret", "https://db-id.apps.astra.datastax.com")
      ).rejects.toThrow("Connection failed hard");
    });

    expect(result.current.connectError).toBe("Connection failed hard");
    expect(resetConversationTracking).not.toHaveBeenCalled();
  });

  it("updates keyspaces and selection state across manual connect flows", async () => {
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        hasToken: false,
        hasEndpoint: false,
      }),
    })) as typeof fetch;
    fetchCollectionsFromApiMock
      .mockResolvedValueOnce(makeConnectionResult())
      .mockResolvedValueOnce(
        makeConnectionResult({
          collections: [
            { name: "customers", count: 4, vectorDim: null, vectorizeService: null },
          ],
          keyspaces: ["ks2", "ks3"],
        })
      );

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

    await act(async () => {
      await result.current.handleKeyspaceChange("ks2");
    });

    expect(fetchCollectionsFromApiMock).not.toHaveBeenCalled();
    expect(result.current.selectedKeyspace).toBe("ks2");

    await act(async () => {
      await result.current.handleConnect(
        "AstraCS:secret",
        "https://db-id-us-east1.apps.astra.datastax.com"
      );
    });

    await act(async () => {
      await result.current.handleKeyspaceChange("ks2");
    });

    expect(fetchCollectionsFromApiMock).toHaveBeenLastCalledWith(
      "AstraCS:secret",
      "https://db-id-us-east1.apps.astra.datastax.com",
      "ks2"
    );
    expect(result.current.activeCollection).toBe("customers");

    act(() => {
      result.current.handleSelectCollection("customers");
      result.current.handleCollectionCreated({
        name: "tickets",
        count: 0,
        vectorDim: 1536,
        vectorizeService: null,
      });
    });

    expect(result.current.activeCollection).toBe("tickets");
    expect(result.current.collections.map((collection) => collection.name)).toContain(
      "tickets"
    );
  });

  it("disconnects cleanly and resets derived connection state", async () => {
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        hasToken: false,
        hasEndpoint: false,
      }),
    })) as typeof fetch;
    fetchCollectionsFromApiMock.mockResolvedValueOnce(makeConnectionResult());

    const bootstrapConversations = vi.fn().mockResolvedValue("conv-1");
    const resetConversationTracking = vi.fn();
    const onDisconnectViewReset = vi.fn();

    const { result } = renderHook(() =>
      usePlaygroundConnection({
        bootstrapConversations,
        resetConversationTracking,
        onDisconnectViewReset,
      })
    );

    await waitFor(() => {
      expect(result.current.initializing).toBe(false);
    });

    await act(async () => {
      await result.current.handleConnect(
        "AstraCS:secret",
        "https://db-id-us-east1.apps.astra.datastax.com"
      );
    });

    act(() => {
      result.current.handleDisconnect();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.astraToken).toBe("");
    expect(result.current.astraEndpoint).toBe("");
    expect(result.current.collections).toEqual([]);
    expect(result.current.collectionFields).toEqual({});
    expect(result.current.activeCollection).toBe("");
    expect(result.current.keyspaces).toEqual([]);
    expect(result.current.selectedKeyspace).toBe("default_keyspace");
    expect(resetConversationTracking).toHaveBeenCalledTimes(2);
    expect(onDisconnectViewReset).toHaveBeenCalledTimes(1);
    expect(bootstrapConversations).toHaveBeenCalledTimes(3);
  });
});
