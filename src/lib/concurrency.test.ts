import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("maps all items with bounded concurrency", async () => {
    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (n) => n * 10
    );

    expect(results).toEqual([
      { status: "fulfilled", value: 10 },
      { status: "fulfilled", value: 20 },
      { status: "fulfilled", value: 30 },
      { status: "fulfilled", value: 40 },
      { status: "fulfilled", value: 50 },
    ]);
  });

  it("captures rejections without aborting other items", async () => {
    const results = await mapWithConcurrency(
      ["a", "b", "c"],
      3,
      async (item) => {
        if (item === "b") throw new Error("boom");
        return item.toUpperCase();
      }
    );

    expect(results[0]).toEqual({ status: "fulfilled", value: "A" });
    expect(results[1]).toMatchObject({ status: "rejected" });
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(results[2]).toEqual({ status: "fulfilled", value: "C" });
  });

  it("handles empty input", async () => {
    const results = await mapWithConcurrency([], 4, async (n: number) => n);
    expect(results).toEqual([]);
  });

  it("limits actual concurrency to the number of items", async () => {
    let maxConcurrent = 0;
    let running = 0;

    const results = await mapWithConcurrency(
      [1, 2, 3],
      10,
      async (n) => {
        running += 1;
        maxConcurrent = Math.max(maxConcurrent, running);
        await new Promise((r) => setTimeout(r, 10));
        running -= 1;
        return n;
      }
    );

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});
