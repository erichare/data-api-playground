import { describe, expect, it } from "vitest";
import {
  appendConnectionFormData,
  buildConnectionRequestBody,
  getBackendConnectionLabel,
  getBackendDisplayName,
  hasConnectionCredentials,
  normalizeBackendKind,
  normalizeEndpoint,
} from "@/lib/backends/types";

describe("backend connection helpers", () => {
  it("normalizes backend kinds and endpoints", () => {
    expect(normalizeBackendKind("hcd")).toBe("hcd");
    expect(normalizeBackendKind("astra")).toBe("astra");
    expect(normalizeBackendKind("anything-else")).toBe("astra");
    expect(normalizeEndpoint("https://db.example.com/")).toBe(
      "https://db.example.com"
    );
    expect(normalizeEndpoint(undefined)).toBe("");
  });

  it("builds request bodies for Astra and HCD connections", () => {
    expect(
      buildConnectionRequestBody({
        backend: "astra",
        token: "AstraCS:token",
        endpoint: "https://db.apps.astra.datastax.com",
        keyspace: "orders",
      })
    ).toEqual({
      token: "AstraCS:token",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "orders",
    });

    expect(
      buildConnectionRequestBody(
        {
          backend: "astra",
          token: "",
          endpoint: "",
          fromEnv: true,
        },
        { keyspace: "analytics" }
      )
    ).toEqual({
      keyspace: "analytics",
    });

    expect(
      buildConnectionRequestBody({
        backend: "astra",
        token: "",
        endpoint: "",
        fromAstraCli: true,
        astraCliProfile: "default",
        astraCliDatabase: "db-123",
      })
    ).toEqual({
      fromAstraCli: true,
      astraCliProfile: "default",
      astraCliDatabase: "db-123",
    });

    expect(
      buildConnectionRequestBody({
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "cassandra",
        password: "secret",
        keyspace: "ks1",
      })
    ).toEqual({
      backend: "hcd",
      endpoint: "https://hcd.example.com:8181",
      username: "cassandra",
      password: "secret",
      keyspace: "ks1",
    });

    expect(
      buildConnectionRequestBody({
        backend: "hcd",
        endpoint: "",
        username: "",
        password: "",
        fromEnv: true,
      })
    ).toEqual({
      backend: "hcd",
    });
  });

  it("detects usable credentials and appends request payloads to form data", () => {
    expect(hasConnectionCredentials(null)).toBe(false);
    expect(
      hasConnectionCredentials({
        backend: "astra",
        token: "",
        endpoint: "",
        fromEnv: true,
      })
    ).toBe(true);
    expect(
      hasConnectionCredentials({
        backend: "astra",
        token: "",
        endpoint: "",
        fromAstraCli: true,
        astraCliProfile: "default",
        astraCliDatabase: "db-123",
      })
    ).toBe(true);
    expect(
      hasConnectionCredentials({
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "cassandra",
        password: "secret",
      })
    ).toBe(true);
    expect(
      hasConnectionCredentials({
        backend: "hcd",
        endpoint: "",
        username: "",
        password: "",
      })
    ).toBe(false);

    const astraFormData = new FormData();
    appendConnectionFormData(astraFormData, {
      backend: "astra",
      token: "AstraCS:token",
      endpoint: "https://db.apps.astra.datastax.com",
    });
    expect(Array.from(astraFormData.entries())).toEqual([
      ["token", "AstraCS:token"],
      ["endpoint", "https://db.apps.astra.datastax.com"],
    ]);

    const hcdFormData = new FormData();
    appendConnectionFormData(
      hcdFormData,
      {
        backend: "hcd",
        endpoint: "",
        username: "",
        password: "",
        fromEnv: true,
      },
      { keyspace: "orders" }
    );
    expect(Array.from(hcdFormData.entries())).toEqual([
      ["backend", "hcd"],
      ["keyspace", "orders"],
    ]);
  });

  it("returns display names and short labels", () => {
    expect(getBackendDisplayName("astra")).toBe("Data API");
    expect(getBackendDisplayName("hcd")).toBe("DataStax HCD");
    expect(getBackendConnectionLabel("astra")).toBe("Data API");
    expect(getBackendConnectionLabel("hcd")).toBe("HCD");
  });
});
