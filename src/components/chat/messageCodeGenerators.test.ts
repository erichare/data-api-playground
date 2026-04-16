import { describe, expect, it } from "vitest";
import { toTypeScriptCommand } from "./messageCodeGenerators";

describe("toTypeScriptCommand", () => {
  it("formats find searches as collection-based TypeScript examples", () => {
    expect(
      toTypeScriptCommand(
        'await db.collection("orders")\n  .find({}, { sort: { total_spend: -1 }, limit: 3 })'
      )
    ).toBe(
      [
        'const collection = db.collection("orders");',
        "",
        "const results = await collection.find({}, { sort: { total_spend: -1 }, limit: 3 }).toArray();",
      ].join("\n")
    );
  });

  it("formats rerank searches with an explicit cursor", () => {
    expect(
      toTypeScriptCommand(
        'await db.collection("docs")\n  .findAndRerank({}, { sort: { $hybrid: { $vectorize: query } }, limit: 4 })\n  .toArray()'
      )
    ).toBe(
      [
        'const collection = db.collection("docs");',
        "",
        "const cursor = collection.findAndRerank(",
        "  {},",
        "  { sort: { $hybrid: { $vectorize: query } }, limit: 4 }",
        ");",
        "const results = await cursor.toArray();",
      ].join("\n")
    );
  });

  it("keeps OpenRAG commands intact while turning them into assignable examples", () => {
    expect(
      toTypeScriptCommand('await openrag.search.query("hello", { limit: 5 })')
    ).toBe('const results = await openrag.search.query("hello", { limit: 5 });');
  });

  it("keeps summary comments while formatting the following search command", () => {
    expect(
      toTypeScriptCommand(
        [
          "// Low-confidence fallback: searched customers",
          'await db.collection("customers")',
          "  .find({}, { sort: { $vector: embedding }, limit: 5, includeSimilarity: true })",
          "  .toArray()",
        ].join("\n")
      )
    ).toBe(
      [
        "// Low-confidence fallback: searched customers",
        'const collection = db.collection("customers");',
        "",
        "const results = await collection.find(",
        "  {},",
        "  { sort: { $vector: embedding }, limit: 5, includeSimilarity: true }",
        ").toArray();",
      ].join("\n")
    );
  });

  it("turns summary-only comments into a representative TypeScript snippet", () => {
    expect(
      toTypeScriptCommand("// Searched 2 collections: orders, customers", {
        collection: "orders",
        collections: ["orders", "customers"],
      })
    ).toBe(
      [
        "// Searched 2 collections: orders, customers",
        'const collections = ["orders","customers"];',
        "",
        "const resultsByCollection = await Promise.all(",
        "  collections.map(async (name) => {",
        "    const collection = db.collection(name);",
        "    const documents = await collection.find(",
        "      {},",
        "      {",
        "        sort: { $vector: embedding },",
        "        limit: 5,",
        "        includeSimilarity: true,",
        "      }",
        "    ).toArray();",
        "",
        "    return { collection: name, documents };",
        "  })",
        ");",
      ].join("\n")
    );
  });
});
