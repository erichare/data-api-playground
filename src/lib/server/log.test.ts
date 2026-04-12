import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createRequestLogContext,
  logInfo,
  logError,
  sanitizeErrorForClient,
  jsonError,
  type RequestLogContext,
} from "./log";

describe("createRequestLogContext", () => {
  it("returns object with UUID requestId, route, and method", () => {
    const req = { method: "POST" };
    const ctx = createRequestLogContext(req, "/api/test");

    expect(ctx.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(ctx.route).toBe("/api/test");
    expect(ctx.method).toBe("POST");
  });
});

describe("logInfo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls console.info with structured JSON containing all context fields", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const ctx: RequestLogContext = {
      requestId: "req-123",
      route: "/api/foo",
      method: "GET",
    };

    logInfo(ctx, "test_event", { extra: "value" });

    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged).toEqual({
      level: "info",
      event: "test_event",
      requestId: "req-123",
      route: "/api/foo",
      method: "GET",
      extra: "value",
    });
  });
});

describe("logError", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls console.error with structured JSON including error message and stack", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx: RequestLogContext = {
      requestId: "req-456",
      route: "/api/bar",
      method: "POST",
    };
    const err = new Error("something broke");

    logError(ctx, "fail_event", err, { detail: 42 });

    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.level).toBe("error");
    expect(logged.event).toBe("fail_event");
    expect(logged.requestId).toBe("req-456");
    expect(logged.route).toBe("/api/bar");
    expect(logged.method).toBe("POST");
    expect(logged.error).toBe("something broke");
    expect(logged.stack).toContain("something broke");
    expect(logged.detail).toBe(42);
  });

  it("uses String(error) for non-Error values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx: RequestLogContext = {
      requestId: "req-789",
      route: "/api/baz",
      method: "DELETE",
    };

    logError(ctx, "string_error", "plain string error");

    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.error).toBe("plain string error");
    expect(logged.stack).toBeUndefined();
  });
});

describe("sanitizeErrorForClient", () => {
  it("strips AstraCS tokens", () => {
    const err = new Error("Failed with AstraCS:abc123xyz token");
    const result = sanitizeErrorForClient(err, "fallback");
    expect(result).not.toContain("AstraCS:abc123xyz");
    expect(result).toContain("[REDACTED]");
  });

  it("strips Bearer tokens", () => {
    const err = new Error("Auth failed: Bearer xyz987secret");
    const result = sanitizeErrorForClient(err, "fallback");
    expect(result).not.toContain("Bearer xyz987secret");
    expect(result).toContain("[REDACTED]");
  });

  it("strips hf_ tokens", () => {
    const err = new Error("HuggingFace key hf_abc123DEF456");
    const result = sanitizeErrorForClient(err, "fallback");
    expect(result).not.toContain("hf_abc123DEF456");
    expect(result).toContain("[REDACTED]");
  });

  it("truncates messages to 500 characters", () => {
    const longMessage = "x".repeat(600);
    const err = new Error(longMessage);
    const result = sanitizeErrorForClient(err, "fallback");
    expect(result).toHaveLength(500);
  });

  it("uses fallback for non-Error input", () => {
    const result = sanitizeErrorForClient("not an error", "my fallback");
    expect(result).toBe("my fallback");
  });
});

describe("jsonError", () => {
  it("returns NextResponse with correct status, error, requestId, and X-Request-Id header", async () => {
    const ctx: RequestLogContext = {
      requestId: "req-json-1",
      route: "/api/test",
      method: "POST",
    };

    const response = jsonError(ctx, 422, "Validation failed", {
      field: "name",
    });

    expect(response.status).toBe(422);
    expect(response.headers.get("X-Request-Id")).toBe("req-json-1");

    const body = await response.json();
    expect(body.error).toBe("Validation failed");
    expect(body.requestId).toBe("req-json-1");
    expect(body.field).toBe("name");
  });
});
