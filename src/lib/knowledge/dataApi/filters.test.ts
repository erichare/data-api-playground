import { describe, expect, it } from "vitest";
import {
  buildFilterClause,
  isSafeFilterValue,
  sanitizeFilterField,
  sanitizeFilterOp,
} from "@/lib/knowledge/dataApi/filters";

describe("filters", () => {
  describe("sanitizeFilterField", () => {
    it("accepts valid identifier-style fields", () => {
      expect(sanitizeFilterField("metadata.source_doc_id")).toBe("metadata.source_doc_id");
      expect(sanitizeFilterField("title")).toBe("title");
    });

    it("rejects empty, $-prefixed, or unsafe fields", () => {
      expect(sanitizeFilterField(null)).toBeNull();
      expect(sanitizeFilterField("")).toBeNull();
      expect(sanitizeFilterField("$set")).toBeNull();
      expect(sanitizeFilterField("foo bar")).toBeNull();
      expect(sanitizeFilterField("foo;DROP")).toBeNull();
    });
  });

  describe("sanitizeFilterOp", () => {
    it("only allows the documented operators", () => {
      expect(sanitizeFilterOp("$eq")).toBe("$eq");
      expect(sanitizeFilterOp("$in")).toBe("$in");
      expect(sanitizeFilterOp("$where")).toBeNull();
      expect(sanitizeFilterOp(null)).toBeNull();
    });
  });

  describe("isSafeFilterValue", () => {
    it("accepts primitives and primitive arrays", () => {
      expect(isSafeFilterValue("hello")).toBe(true);
      expect(isSafeFilterValue(42)).toBe(true);
      expect(isSafeFilterValue(true)).toBe(true);
      expect(isSafeFilterValue([1, "two", false])).toBe(true);
    });

    it("rejects nested objects, mixed arrays, and null", () => {
      expect(isSafeFilterValue(null)).toBe(false);
      expect(isSafeFilterValue({ injected: true })).toBe(false);
      expect(isSafeFilterValue([{}])).toBe(false);
    });
  });

  describe("buildFilterClause", () => {
    it("returns an empty clause when the field or value is missing/unsafe", () => {
      expect(buildFilterClause({ field: null, op: "$eq", value: 1 })).toEqual({
        filter: {},
        filterString: "{}",
      });
      expect(
        buildFilterClause({ field: "foo", op: "$eq", value: { nope: true } })
      ).toEqual({ filter: {}, filterString: "{}" });
    });

    it("emits a flat clause when the operator defaults to $eq", () => {
      expect(buildFilterClause({ field: "title", op: null, value: "hello" })).toEqual({
        filter: { title: "hello" },
        filterString: '{ title: "hello" }',
      });
    });

    it("wraps the value in the operator when one is provided", () => {
      expect(buildFilterClause({ field: "score", op: "$gt", value: 0.5 })).toEqual({
        filter: { score: { $gt: 0.5 } },
        filterString: "{ score: { $gt: 0.5 } }",
      });
    });
  });
});
