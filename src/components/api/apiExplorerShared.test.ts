import { describe, expect, it } from "vitest";
import {
  createNetworkErrorResponse,
  getCode,
  getDefaultBody,
  getEndpointPath,
  normalizeProxyResponse,
} from "./apiExplorerShared";

describe("apiExplorerShared", () => {
  it("uses vectorize defaults when the collection has a vectorize service", () => {
    const body = JSON.parse(
      getDefaultBody("vectorSearch", {
        name: "products",
        count: 0,
        vectorDim: 1536,
        vectorizeService: {
          provider: "openai",
          modelName: "text-embedding-3-small",
        },
      })
    ) as {
      find: { sort: { $vectorize?: string; $vector?: number[] } };
    };

    expect(body.find.sort.$vectorize).toBe("sample query text");
    expect(body.find.sort.$vector).toBeUndefined();
  });

  it("uses raw vector defaults when the collection does not support vectorize", () => {
    const body = JSON.parse(
      getDefaultBody("vectorSearch", {
        name: "products",
        count: 0,
        vectorDim: 3,
        vectorizeService: null,
      })
    ) as {
      find: { sort: { $vectorize?: string; $vector?: number[] } };
    };

    expect(body.find.sort.$vector).toEqual([0.1, 0.2, 0.3]);
    expect(body.find.sort.$vectorize).toBeUndefined();
  });

  it("builds curl snippets with the selected keyspace and collection", () => {
    const code = getCode(
      "find",
      "orders",
      JSON.stringify({ find: { filter: {} } }, null, 2),
      "curl",
      "analytics"
    );

    expect(code).toContain("$ASTRA_DB_ENDPOINT/api/json/v1/analytics/orders");
    expect(code).toContain('-H "Token: $ASTRA_DB_TOKEN"');
    expect(code).toContain(`-d '{`);
  });

  it("builds the displayed endpoint path with a placeholder when no collection is selected", () => {
    expect(getEndpointPath("analytics", "")).toBe(
      "…/api/json/v1/analytics/{collection}"
    );
  });

  it("normalizes proxy error payloads without a status into a 500 response", () => {
    expect(
      normalizeProxyResponse({
        error: "Missing token",
        status: 0,
        statusText: "",
        latencyMs: 0,
        data: null,
      })
    ).toEqual({
      status: 500,
      statusText: "Error",
      latencyMs: 0,
      data: { error: "Missing token" },
    });
  });

  it("builds network error responses from thrown errors", () => {
    expect(createNetworkErrorResponse(new Error("boom"))).toEqual({
      status: 0,
      statusText: "Network Error",
      latencyMs: 0,
      data: { error: "Error: boom" },
    });
  });
});
