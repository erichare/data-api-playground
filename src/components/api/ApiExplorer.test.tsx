// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiExplorer } from "./ApiExplorer";

vi.mock("framer-motion", () => {
  const cleanProps = (props: Record<string, unknown>) => {
    const { whileTap, initial, animate, exit, transition, whileHover, ...rest } = props;

    void whileTap;
    void initial;
    void animate;
    void exit;
    void transition;
    void whileHover;

    return rest;
  };

  return {
    motion: {
      button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...cleanProps(props)}>{children}</button>
      ),
    },
  };
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
    ...init,
  });
}

function makeCollection() {
  return {
    name: "orders",
    count: 10,
    vectorDim: 3,
    vectorizeService: null,
  };
}

describe("ApiExplorer", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "setInterval").mockReturnValue(1 as unknown as number);
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("disables running when no collection is selected", () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ calls: [] })) as typeof fetch;

    render(
      <ApiExplorer
        astraToken="AstraCS:secret"
        astraEndpoint="https://db.apps.astra.datastax.com"
        keyspace="default_keyspace"
      />
    );

    expect((screen.getByTestId("api-run-button") as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText("Select a collection from the sidebar to run requests")
    ).not.toBeNull();
  });

  it("shows a validation error and skips the proxy request for invalid JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ calls: [] }));
    global.fetch = fetchMock as typeof fetch;

    render(
      <ApiExplorer
        collection={makeCollection()}
        astraToken="AstraCS:secret"
        astraEndpoint="https://db.apps.astra.datastax.com"
        keyspace="default_keyspace"
      />
    );

    fireEvent.change(screen.getByTestId("api-request-body"), {
      target: { value: "{" },
    });
    fireEvent.click(screen.getByTestId("api-run-button"));

    await waitFor(() => {
      expect(screen.getByText("Invalid JSON")).not.toBeNull();
    });

    const proxyCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "/api/data-api-proxy"
    );
    expect(proxyCalls).toHaveLength(0);
  });

  it("resets the request body when switching operations", () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ calls: [] })) as typeof fetch;

    render(
      <ApiExplorer
        collection={makeCollection()}
        astraToken="AstraCS:secret"
        astraEndpoint="https://db.apps.astra.datastax.com"
        keyspace="default_keyspace"
      />
    );

    fireEvent.change(screen.getByTestId("api-request-body"), {
      target: { value: '{"custom":true}' },
    });

    fireEvent.click(screen.getByText("Estimated Count"));
    expect((screen.getByTestId("api-request-body") as HTMLTextAreaElement).value).toContain(
      '"estimatedDocumentCount"'
    );

    fireEvent.click(screen.getByText("Vector Search"));
    const body = (screen.getByTestId("api-request-body") as HTMLTextAreaElement).value;
    expect(body).toContain('"$vector"');
    expect(body).not.toContain('"$vectorize"');
  });

  it("runs requests and refreshes the TypeScript client log", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ calls: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 200,
          statusText: "OK",
          latencyMs: 12,
          data: { ok: true },
        })
      )
      .mockResolvedValueOnce(
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

    render(
      <ApiExplorer
        collection={makeCollection()}
        astraToken="AstraCS:secret"
        astraEndpoint="https://db.apps.astra.datastax.com"
        keyspace="default_keyspace"
      />
    );

    fireEvent.click(screen.getByText("Find One"));
    fireEvent.click(screen.getByTestId("api-run-button"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const proxyCall = fetchMock.mock.calls[1] as [RequestInfo | URL, RequestInit];
    expect(String(proxyCall[0])).toBe("/api/data-api-proxy");
    expect(JSON.parse(String(proxyCall[1].body))).toEqual({
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
      collection: "orders",
      requestBody: { findOne: { filter: {} } },
    });

    await waitFor(() => {
      expect(screen.getByText("200 OK")).not.toBeNull();
      expect(screen.getByText('db.collection("orders").findOne')).not.toBeNull();
    });
  });
});
