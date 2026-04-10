import { beforeEach, describe, expect, it } from "vitest";
import {
  buildTsCall,
  clearAstraClientCalls,
  formatTsMethodCall,
  listAstraClientCalls,
  rawTs,
  recordAstraClientCall,
} from "./astraClientLog";

describe("astraClientLog", () => {
  beforeEach(() => {
    clearAstraClientCalls();
  });

  it("stores recent calls with newest entries first", () => {
    recordAstraClientCall({
      label: "First",
      code: "await db.collection(\"alpha\")\n  .find({})",
      timestamp: "2026-04-10T00:00:00.000Z",
    });
    recordAstraClientCall({
      label: "Second",
      code: "await db.collection(\"beta\")\n  .find({})",
      timestamp: "2026-04-10T00:01:00.000Z",
    });

    expect(listAstraClientCalls()).toMatchObject([
      {
        label: "Second",
        code: "await db.collection(\"beta\")\n  .find({})",
      },
      {
        label: "First",
        code: "await db.collection(\"alpha\")\n  .find({})",
      },
    ]);
  });

  it("formats multiline method calls and preserves raw snippets", () => {
    const code = buildTsCall('db.collection("knowledge")', [
      formatTsMethodCall("insertMany", [rawTs("docsBatch /* 10 chunks */")]),
    ]);

    expect(code).toBe(
      'await db.collection("knowledge")\n' +
        "  .insertMany(docsBatch /* 10 chunks */)"
    );
  });

  it("formats object arguments across multiple lines when needed", () => {
    const method = formatTsMethodCall("find", [
      { category: "docs" },
      { projection: { title: 1, content: 1 }, limit: 25 },
    ]);

    expect(method).toContain(".find(");
    expect(method).toContain('"category": "docs"');
    expect(method).toContain('"projection"');
  });
});
