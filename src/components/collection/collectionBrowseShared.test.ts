import { describe, expect, it } from "vitest";
import { getBrowseCode, getColumns } from "./collectionBrowseShared";

describe("collection browse helpers", () => {
  it("orders inferred columns with _id first and $vector last", () => {
    expect(
      getColumns([
        { title: "A", _id: "1", $vector: [1, 2], category: "news" },
        { _id: "2", author: "Sam", category: "updates" },
      ])
    ).toEqual(["_id", "author", "category", "title", "$vector"]);
  });

  it("generates sorted browse code for each language", () => {
    const sort = { col: "created_at", dir: -1 as const };

    expect(getBrowseCode("ts", "docs", sort)).toContain(
      '.find({}, { sort: { "created_at": -1 } })'
    );
    expect(getBrowseCode("python", "docs", sort)).toContain(
      'sort={"created_at": SortDocuments.DESCENDING}'
    );
    expect(getBrowseCode("java", "docs", sort)).toContain(
      '.sort(Sorts.descending("created_at"))'
    );
    expect(getBrowseCode("curl", "docs", sort)).toContain(
      '"sort": {\n      "created_at": -1\n    }'
    );
  });
});
