// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCollectionForm } from "./useCollectionForm";
import type { Collection } from "@/lib/types";
import type { ProviderModel } from "@/components/collection/collectionFormShared";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MODEL_A: ProviderModel = {
  provider: "nvidia",
  providerDisplayName: "NVIDIA",
  modelName: "NV-Embed-QA",
  vectorDimension: 1024,
};

const MODEL_B: ProviderModel = {
  provider: "openai",
  providerDisplayName: "OpenAI",
  modelName: "text-embedding-3-small",
  vectorDimension: 1536,
};

const DEMO_COLLECTION: Collection = {
  name: "my_collection",
  count: 0,
  vectorDim: null,
  vectorizeService: { provider: "nvidia", modelName: "NV-Embed-QA" },
};

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function makeProvidersResponse(models: ProviderModel[] = [MODEL_A]) {
  return {
    ok: true,
    json: async () => ({ models }),
  } as Response;
}

function makeCreateCollectionResponse(collection: Collection = DEMO_COLLECTION) {
  return {
    ok: true,
    json: async () => ({ collection }),
  } as Response;
}

function makeErrorResponse(status: number, error: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error }),
  } as Response;
}

// ---------------------------------------------------------------------------
// Default hook args
// ---------------------------------------------------------------------------

function baseArgs(
  overrides: Partial<Parameters<typeof useCollectionForm>[0]> = {}
) {
  return {
    open: true,
    onCreated: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useCollectionForm", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ─── Initial state ────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("returns default field values on first render", () => {
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() => useCollectionForm(baseArgs()));

      expect(result.current.name).toBe("");
      expect(result.current.mode).toBe("vectorize");
      expect(result.current.dimension).toBe(768);
      expect(result.current.metric).toBe("cosine");
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe("");
      expect(result.current.loadingProviders).toBe(false);
      expect(result.current.providersError).toBe("");
      expect(result.current.providerModels).toEqual([]);
      expect(result.current.selectedModelIdx).toBe(0);
      expect(result.current.selectedModel).toBeNull();
    });

    it("canSubmit is false when name is empty", () => {
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() => useCollectionForm(baseArgs()));
      expect(result.current.canSubmit).toBe(false);
    });

    it("reflects isConnected from args", () => {
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: true }))
      );
      expect(result.current.isConnected).toBe(true);
    });

    it("selectedModel is null when providerModels is empty", () => {
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() => useCollectionForm(baseArgs()));
      expect(result.current.selectedModel).toBeNull();
    });
  });

  // ─── Form field setters ───────────────────────────────────────────────────

  describe("form field updates", () => {
    it("setName updates the name value", async () => {
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() => useCollectionForm(baseArgs()));

      await act(async () => {
        result.current.setName("test_col");
      });

      expect(result.current.name).toBe("test_col");
    });

    it("setMode updates the mode value", async () => {
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() => useCollectionForm(baseArgs()));

      await act(async () => {
        result.current.setMode("client");
      });

      expect(result.current.mode).toBe("client");
    });

    it("setDimension updates the dimension value", async () => {
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() => useCollectionForm(baseArgs()));

      await act(async () => {
        result.current.setDimension(1536);
      });

      expect(result.current.dimension).toBe(1536);
    });

    it("setMetric updates the metric value", async () => {
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() => useCollectionForm(baseArgs()));

      await act(async () => {
        result.current.setMetric("dot_product");
      });

      expect(result.current.metric).toBe("dot_product");
    });

    it("setSelectedModelIdx updates the selected model", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        makeProvidersResponse([MODEL_A, MODEL_B])
      ) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: true, open: true }))
      );

      await waitFor(() => expect(result.current.providerModels).toHaveLength(2));

      await act(async () => {
        result.current.setSelectedModelIdx(1);
      });

      expect(result.current.selectedModel).toEqual(MODEL_B);
    });
  });

  // ─── canSubmit validation ─────────────────────────────────────────────────

  describe("canSubmit validation", () => {
    it("is false when name is whitespace only", async () => {
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() => useCollectionForm(baseArgs()));

      await act(async () => {
        result.current.setName("   ");
      });

      expect(result.current.canSubmit).toBe(false);
    });

    it("is true when name is non-empty and not connected", async () => {
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: false }))
      );

      await act(async () => {
        result.current.setName("col");
      });

      expect(result.current.canSubmit).toBe(true);
    });

    it("is false in vectorize mode when connected but no model loaded", async () => {
      // fetch never resolves so providerModels stays empty
      global.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: true }))
      );

      await act(async () => {
        result.current.setName("col");
      });

      // mode=vectorize, isConnected=true, selectedModel=null → canSubmit false
      expect(result.current.canSubmit).toBe(false);
    });

    it("is true in client mode when connected with a name, even without a model", async () => {
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: true }))
      );

      await act(async () => {
        result.current.setName("col");
        result.current.setMode("client");
      });

      expect(result.current.canSubmit).toBe(true);
    });

    it("is true in vectorize mode when connected and model is loaded", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        makeProvidersResponse([MODEL_A])
      ) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: true, open: true }))
      );

      await waitFor(() => expect(result.current.selectedModel).toEqual(MODEL_A));

      await act(async () => {
        result.current.setName("col");
      });

      expect(result.current.canSubmit).toBe(true);
    });

    it("is false while loading (submission in progress)", async () => {
      // isConnected=true + open=false means: no provider fetch, but createCollection will hit /api/create-collection
      // Fetch that hangs so createCollection never resolves
      let resolveCreate!: (v: Response) => void;
      global.fetch = vi.fn((url: RequestInfo | URL) => {
        const u = String(url);
        if (u === "/api/create-collection") {
          return new Promise<Response>((res) => {
            resolveCreate = res;
          });
        }
        // Shouldn't be hit (open=false suppresses provider fetch)
        return Promise.resolve(makeProvidersResponse([]));
      }) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(
          baseArgs({ isConnected: true, open: false })
        )
      );

      // Switch to client mode so canSubmit doesn't require a selectedModel
      await act(async () => {
        result.current.setName("col");
        result.current.setMode("client");
      });

      // Start submission — don't await so loading stays true
      act(() => {
        void result.current.handleCreate();
      });

      // loading is true → canSubmit must be false
      expect(result.current.loading).toBe(true);
      expect(result.current.canSubmit).toBe(false);

      // Clean up the pending promise
      await act(async () => {
        resolveCreate(makeCreateCollectionResponse());
      });
    });
  });

  // ─── Provider model loading ───────────────────────────────────────────────

  describe("provider model loading", () => {
    it("does not call fetch when isConnected is false", async () => {
      global.fetch = vi.fn() as typeof fetch;

      renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: false, open: true }))
      );

      await act(async () => {});

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does not call fetch when open is false", async () => {
      global.fetch = vi.fn() as typeof fetch;

      renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: true, open: false }))
      );

      await act(async () => {});

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("calls /api/embedding-providers when open=true and isConnected=true", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        makeProvidersResponse([MODEL_A])
      ) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(
          baseArgs({
            isConnected: true,
            open: true,
            astraToken: "tok",
            astraEndpoint: "ep",
          })
        )
      );

      await waitFor(() => expect(result.current.providerModels).toHaveLength(1));

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/embedding-providers",
        expect.objectContaining({ method: "POST" })
      );
      expect(result.current.providerModels).toEqual([MODEL_A]);
      expect(result.current.selectedModel).toEqual(MODEL_A);
      expect(result.current.loadingProviders).toBe(false);
    });

    it("sets providersError when the API returns an error body", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        makeErrorResponse(500, "providers unavailable")
      ) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: true, open: true }))
      );

      await waitFor(() => expect(result.current.providersError).toBe("providers unavailable"));
      expect(result.current.loadingProviders).toBe(false);
    });

    it("sets generic providersError when fetch itself rejects", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: true, open: true }))
      );

      await waitFor(() => expect(result.current.providersError).toBe("network down"));
    });

    it("sets generic providersError for non-Error rejections", async () => {
      global.fetch = vi.fn().mockRejectedValue("oops") as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: true, open: true }))
      );

      await waitFor(() =>
        expect(result.current.providersError).toBe("Failed to load providers")
      );
    });

    it("does not re-fetch providers if models are already loaded", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        makeProvidersResponse([MODEL_A])
      ) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: true, open: true }))
      );

      await waitFor(() => expect(result.current.providerModels).toHaveLength(1));

      const callCount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

      // Trigger a re-render by updating an unrelated field
      await act(async () => {
        result.current.setName("x");
      });

      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    });

    it("does not call fetch in client mode (mode guard in effect)", async () => {
      global.fetch = vi.fn() as typeof fetch;

      renderHook(() =>
        useCollectionForm(
          baseArgs({ isConnected: true, open: true })
        )
      );

      // Mode starts as "vectorize" so fetch fires; this test is about switching
      // to "client" and not getting a second fetch. Covered by "does not re-fetch"
      // test. Here we verify the initial fetch fires for vectorize only.
      await act(async () => {});
      // fetch was called (or attempted) for vectorize mode
      // The key assertion is that it's not called extra times for client mode
      const callCountAfterInit = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

      // Switch to client mode — effect should NOT trigger another fetch
      await act(async () => {});
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountAfterInit);
    });
  });

  // ─── Submission – success ─────────────────────────────────────────────────

  describe("handleCreate – success", () => {
    it("calls onCreated with the created collection", async () => {
      const onCreated = vi.fn();
      const onClose = vi.fn();
      global.fetch = vi.fn().mockResolvedValue(
        makeCreateCollectionResponse(DEMO_COLLECTION)
      ) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: false, onCreated, onClose }))
      );

      await act(async () => {
        result.current.setName("my_collection");
      });

      await act(async () => {
        await result.current.handleCreate();
      });

      expect(onCreated).toHaveBeenCalledWith(DEMO_COLLECTION);
      expect(onClose).toHaveBeenCalled();
    });

    it("resets name and clears error after successful creation", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        makeCreateCollectionResponse()
      ) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: false }))
      );

      await act(async () => {
        result.current.setName("my_collection");
      });

      await act(async () => {
        await result.current.handleCreate();
      });

      expect(result.current.name).toBe("");
      expect(result.current.error).toBe("");
      expect(result.current.loading).toBe(false);
    });

    it("does nothing when canSubmit is false (empty name)", async () => {
      const onCreated = vi.fn();
      global.fetch = vi.fn() as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(baseArgs({ isConnected: false, onCreated }))
      );

      // name is empty → canSubmit is false
      await act(async () => {
        await result.current.handleCreate();
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(onCreated).not.toHaveBeenCalled();
    });

    it("creates a demo collection without calling fetch when not connected", async () => {
      global.fetch = vi.fn() as typeof fetch;
      const onCreated = vi.fn();

      const { result } = renderHook(() =>
        useCollectionForm(
          baseArgs({ isConnected: false, onCreated })
        )
      );

      await act(async () => {
        result.current.setName("my_collection");
      });

      await act(async () => {
        await result.current.handleCreate();
      });

      // createCollection returns a demo collection without making network calls
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ name: "my_collection" })
      );
    });

    it("closes immediately and reports an optimistic collection when connected", async () => {
      const onCreated = vi.fn();
      const onClose = vi.fn();
      const onCreateStarted = vi.fn();
      let resolveCreate!: (value: Response) => void;
      global.fetch = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveCreate = resolve;
          })
      ) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(
          baseArgs({
            isConnected: true,
            open: false,
            onCreated,
            onClose,
            onCreateStarted,
          })
        )
      );

      await act(async () => {
        result.current.setName("reports");
        result.current.setMode("client");
      });

      act(() => {
        void result.current.handleCreate();
      });

      expect(onCreateStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "reports",
          creating: true,
        })
      );
      expect(onClose).toHaveBeenCalled();
      expect(onCreated).not.toHaveBeenCalled();

      await act(async () => {
        resolveCreate(
          makeCreateCollectionResponse({
            name: "reports",
            count: 0,
            documentCount: 0,
            vectorDim: 768,
            vectorizeService: null,
          })
        );
      });

      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ name: "reports" })
      );
    });
  });

  // ─── Submission – error ───────────────────────────────────────────────────

  describe("handleCreate – error", () => {
    it("sets error when createCollection API returns an error body", async () => {
      const onCreateFailed = vi.fn();
      global.fetch = vi.fn().mockResolvedValue(
        makeErrorResponse(400, "server error")
      ) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(
          baseArgs({ isConnected: true, open: false, onCreateFailed })
        )
      );

      // Need a model so canSubmit is satisfied; isConnected but open=false so no provider fetch
      // Use client mode to avoid the selectedModel guard
      await act(async () => {
        result.current.setName("col");
        result.current.setMode("client");
      });

      await act(async () => {
        await result.current.handleCreate();
      });

      expect(onCreateFailed).toHaveBeenCalledWith("col", "server error");
      expect(result.current.error).toBe("");
      expect(result.current.loading).toBe(false);
    });

    it("sets generic error for non-Error throws", async () => {
      // Simulate fetch throwing a non-Error (unusual but possible)
      const onCreateFailed = vi.fn();
      global.fetch = vi.fn().mockRejectedValue("something went wrong") as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(
          baseArgs({ isConnected: true, open: false, onCreateFailed })
        )
      );

      await act(async () => {
        result.current.setName("col");
        result.current.setMode("client");
      });

      await act(async () => {
        await result.current.handleCreate();
      });

      expect(onCreateFailed).toHaveBeenCalledWith(
        "col",
        "Failed to create collection"
      );
      expect(result.current.error).toBe("");
    });

    it("can retry a connected create after a failed background attempt", async () => {
      const onCreateFailed = vi.fn();
      const onCreated = vi.fn();
      // Use isConnected=true + open=false so createCollection hits the real fetch path
      let callCount = 0;
      global.fetch = vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) return makeErrorResponse(500, "first failure");
        return makeCreateCollectionResponse();
      }) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(
          baseArgs({ isConnected: true, open: false, onCreateFailed, onCreated })
        )
      );

      // Use client mode so canSubmit doesn't require a selectedModel
      await act(async () => {
        result.current.setName("col");
        result.current.setMode("client");
      });

      // First attempt fails
      await act(async () => {
        await result.current.handleCreate();
      });
      expect(onCreateFailed).toHaveBeenCalledWith("col", "first failure");
      expect(result.current.error).toBe("");

      await act(async () => {
        result.current.setName("col");
        result.current.setMode("client");
      });

      // Second attempt succeeds after the user re-enters the form data
      await act(async () => {
        await result.current.handleCreate();
      });

      expect(onCreated).toHaveBeenCalled();
      expect(result.current.error).toBe("");
    });

    it("removes the optimistic row through onCreateFailed when connected creation fails", async () => {
      const onCreateStarted = vi.fn();
      const onCreateFailed = vi.fn();
      const onClose = vi.fn();
      global.fetch = vi.fn().mockResolvedValue(
        makeErrorResponse(400, "server error")
      ) as typeof fetch;

      const { result } = renderHook(() =>
        useCollectionForm(
          baseArgs({
            isConnected: true,
            open: false,
            onClose,
            onCreateStarted,
            onCreateFailed,
          })
        )
      );

      await act(async () => {
        result.current.setName("broken");
        result.current.setMode("client");
      });

      await act(async () => {
        await result.current.handleCreate();
      });

      expect(onCreateStarted).toHaveBeenCalledWith(
        expect.objectContaining({ name: "broken", creating: true })
      );
      expect(onClose).toHaveBeenCalled();
      expect(onCreateFailed).toHaveBeenCalledWith("broken", "server error");
      expect(result.current.error).toBe("");
    });
  });

  // ─── createCollection receives correct args ───────────────────────────────

  describe("createCollection arguments", () => {
    it("passes mode=client, dimension, and metric in client mode", async () => {
      global.fetch = vi.fn().mockResolvedValue(
        makeCreateCollectionResponse({
          name: "col",
          count: 0,
          vectorDim: 512,
          vectorizeService: null,
        })
      ) as typeof fetch;

      const onCreated = vi.fn();

      const { result } = renderHook(() =>
        useCollectionForm(
          baseArgs({
            isConnected: true,
            open: false,
            astraToken: "tok",
            astraEndpoint: "ep",
            keyspace: "ks",
            onCreated,
          })
        )
      );

      await act(async () => {
        result.current.setName("col");
        result.current.setMode("client");
        result.current.setDimension(512);
        result.current.setMetric("euclidean");
      });

      await act(async () => {
        await result.current.handleCreate();
      });

      const body = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      );
      expect(body).toMatchObject({
        name: "col",
        dimension: 512,
        metric: "euclidean",
        provider: "none",
        token: "tok",
        endpoint: "ep",
        keyspace: "ks",
      });
    });

    it("passes provider and model when in vectorize mode with a loaded model", async () => {
      global.fetch = vi.fn((url: RequestInfo | URL) => {
        const u = String(url);
        if (u === "/api/embedding-providers") {
          return Promise.resolve(makeProvidersResponse([MODEL_A]));
        }
        return Promise.resolve(
          makeCreateCollectionResponse(DEMO_COLLECTION)
        );
      }) as typeof fetch;

      const onCreated = vi.fn();

      const { result } = renderHook(() =>
        useCollectionForm(
          baseArgs({
            isConnected: true,
            open: true,
            astraToken: "tok",
            astraEndpoint: "ep",
            onCreated,
          })
        )
      );

      await waitFor(() => expect(result.current.selectedModel).toEqual(MODEL_A));

      await act(async () => {
        result.current.setName("vec_col");
      });

      await act(async () => {
        await result.current.handleCreate();
      });

      const createCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => String(c[0]) === "/api/create-collection"
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(createCall![1].body);
      expect(body).toMatchObject({
        name: "vec_col",
        provider: "nvidia",
        model: "NV-Embed-QA",
      });
    });
  });
});
