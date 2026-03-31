import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, isErrorResponse } from "./parse";

const testSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().optional(),
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest(): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json",
  });
}

describe("parseJsonBody", () => {
  it("returns validated data for valid input", async () => {
    const result = await parseJsonBody(makeRequest({ name: "Alice" }), testSchema);
    expect(isErrorResponse(result)).toBe(false);
    expect(result).toEqual({ name: "Alice" });
  });

  it("returns validated data with optional fields", async () => {
    const result = await parseJsonBody(
      makeRequest({ name: "Bob", age: 30 }),
      testSchema
    );
    expect(isErrorResponse(result)).toBe(false);
    expect(result).toEqual({ name: "Bob", age: 30 });
  });

  it("returns 400 for invalid JSON", async () => {
    const result = await parseJsonBody(makeInvalidJsonRequest(), testSchema);
    expect(isErrorResponse(result)).toBe(true);
    expect((result as NextResponse).status).toBe(400);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 with Zod details for invalid body", async () => {
    const result = await parseJsonBody(makeRequest({}), testSchema);
    expect(isErrorResponse(result)).toBe(true);
    expect((result as NextResponse).status).toBe(400);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
    expect(body.details.length).toBeGreaterThan(0);
    expect(body.details[0].path).toBe("name");
  });

  it("returns 400 when field fails constraint", async () => {
    const result = await parseJsonBody(makeRequest({ name: "" }), testSchema);
    expect(isErrorResponse(result)).toBe(true);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("Validation failed");
    expect(body.details[0].path).toBe("name");
  });
});

describe("isErrorResponse", () => {
  it("returns true for NextResponse", () => {
    expect(isErrorResponse(NextResponse.json({}))).toBe(true);
  });

  it("returns false for plain objects", () => {
    expect(isErrorResponse({ name: "test" })).toBe(false);
    expect(isErrorResponse(null)).toBe(false);
    expect(isErrorResponse(undefined)).toBe(false);
  });
});
