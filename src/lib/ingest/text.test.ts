/* eslint-disable security/detect-object-injection -- Text extraction tests inspect typed row maps built from fixture data only. */
import { describe, expect, it } from "vitest";
import {
  chunkText,
  extractTabularRowChunks,
  extractText,
  serializeTabularRow,
} from "./text";

describe("chunkText", () => {
  it("splits long text by paragraph boundaries", () => {
    const para1 = "First paragraph with enough content to be meaningful.";
    const para2 = "Second paragraph that also has meaningful content.";
    const para3 = "Third paragraph that rounds out the test.";
    const text = `${para1}\n\n${para2}\n\n${para3}`;

    // Use a chunkSize that fits para1 alone but not para1 + para2
    const chunkSize = para1.length + 10;
    const chunks = chunkText(text, chunkSize);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toBe(para1);
    expect(chunks[1]).toBe(para2);
  });

  it("handles text shorter than maxChunkSize (single chunk)", () => {
    const text = "This is a short paragraph that fits in one chunk easily.";
    const chunks = chunkText(text, 1200);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("handles empty string", () => {
    const chunks = chunkText("");
    expect(chunks).toHaveLength(0);
  });

  it("splits very long paragraphs that exceed chunkSize", () => {
    // The slicing logic triggers when a paragraph exceeds chunkSize and
    // there is already content accumulated in the current buffer.
    const shortParagraph = "A short opening paragraph with enough length to matter here.";
    const sentence = "This is a sentence that repeats many times over. ";
    const longParagraph = sentence.repeat(50).trim();
    const text = `${shortParagraph}\n\n${longParagraph}`;
    const chunkSize = 200;
    const chunks = chunkText(text, chunkSize);

    // The short paragraph becomes one chunk, and the long one is sliced
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]).toBe(shortParagraph);
    // Remaining chunks are slices of the long paragraph
    for (let i = 1; i < chunks.length; i++) {
      expect(longParagraph).toContain(chunks[i]);
    }
  });

  it("each chunk is within chunkSize (unless a single sentence exceeds it)", () => {
    const paragraphs = [
      "Alpha paragraph with some content that is reasonably sized.",
      "Beta paragraph that is also reasonably sized for testing purposes.",
      "Gamma paragraph providing more test data for chunking verification.",
      "Delta paragraph to ensure we have enough content for multiple chunks.",
    ];
    const text = paragraphs.join("\n\n");
    const chunkSize = 100;
    const chunks = chunkText(text, chunkSize);

    for (const chunk of chunks) {
      // Each chunk should be at most chunkSize, unless it is a single
      // indivisible unit that exceeds that limit
      expect(chunk.length).toBeLessThanOrEqual(chunkSize);
    }
  });
});

describe("serializeTabularRow", () => {
  it("serializes key-value pairs to readable text", () => {
    const row = { name: "Alice", age: 30, city: "Portland" };
    const result = serializeTabularRow(row);

    expect(result).toContain("name: Alice");
    expect(result).toContain("age: 30");
    expect(result).toContain("city: Portland");
    // Values are separated by "; "
    expect(result).toBe("name: Alice; age: 30; city: Portland");
  });

  it("handles empty object", () => {
    const result = serializeTabularRow({});
    expect(result).toBe("");
  });

  it("handles values with various types (string, number, null)", () => {
    const row = {
      label: "test",
      count: 42,
      missing: null,
      empty: "",
      flag: true,
    };
    const result = serializeTabularRow(row);

    // null and empty string are filtered out
    expect(result).toContain("label: test");
    expect(result).toContain("count: 42");
    expect(result).toContain("flag: true");
    // null and "" produce empty stringified values, so they are filtered
    expect(result).not.toContain("missing");
    expect(result).not.toContain("empty");
  });

  it("prepends sheet name when provided", () => {
    const row = { col1: "value1" };
    const result = serializeTabularRow(row, "Sheet1");

    expect(result).toBe("sheet: Sheet1; col1: value1");
  });
});

describe("extractText", () => {
  it("extracts plain text from a txt buffer", async () => {
    const text = "Hello world, this is plain text.";
    const result = await extractText(Buffer.from(text, "utf-8"), "txt");
    expect(result).toBe(text);
  });

  it("extracts plain text from a markdown buffer", async () => {
    const md = "# Title\n\nSome markdown content.";
    const result = await extractText(Buffer.from(md, "utf-8"), "md");
    expect(result).toBe(md);
  });

  it("pretty-prints valid JSON files", async () => {
    const json = '{"name":"Alice","age":30}';
    const result = await extractText(Buffer.from(json, "utf-8"), "json");
    expect(result).toContain('"name": "Alice"');
    expect(result).toContain('"age": 30');
  });

  it("returns raw content for malformed JSON files", async () => {
    const badJson = "{ not valid json at all }}}";
    const result = await extractText(Buffer.from(badJson, "utf-8"), "json");
    expect(result).toBe(badJson);
  });

  it("returns CSV rows as serialized text", async () => {
    const csv = 'name,city\nAlice,Portland\nBob,Seattle\n';
    const result = await extractText(Buffer.from(csv, "utf-8"), "csv");
    expect(result).toContain("name: Alice; city: Portland");
    expect(result).toContain("name: Bob; city: Seattle");
  });

  it("treats unknown extensions as plain text", async () => {
    const content = "Some arbitrary content for unknown file type";
    const result = await extractText(Buffer.from(content, "utf-8"), "xyz");
    expect(result).toBe(content);
  });
});

describe("chunkText edge cases", () => {
  it("discards trailing fragments shorter than 20 characters", () => {
    const text = "A meaningful paragraph here with good content.\n\nTiny.";
    const chunks = chunkText(text, 1200);
    // "Tiny." is < 20 chars so gets discarded
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("A meaningful paragraph");
  });

  it("groups multiple small paragraphs into a single chunk", () => {
    const p1 = "First small paragraph here with enough content.";
    const p2 = "Second paragraph also small enough.";
    const text = `${p1}\n\n${p2}`;
    // chunkSize large enough to fit both
    const chunks = chunkText(text, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(`${p1}\n\n${p2}`);
  });

  it("discards short trailing content when it is under 20 chars", () => {
    const p1 = "A meaningful paragraph that has good content and length for testing purposes.";
    const text = `${p1}\n\nHi`;
    // Hi is the last paragraph. p1 becomes first chunk. "Hi" is < 20 chars so discarded.
    const chunks = chunkText(text, 80);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(p1);
  });
});

describe("extractTabularRowChunks", () => {
  it("parses quoted CSV rows and skips blank lines", async () => {
    const chunks = await extractTabularRowChunks(
      Buffer.from('name,city\n"Ada","New York, NY"\n,\n"Grace","Paris"\n'),
      "csv"
    );

    expect(chunks).toEqual([
      "name: Ada; city: New York, NY",
      "name: Grace; city: Paris",
    ]);
  });

  it("includes sheet names for multi-sheet XLSX uploads", async () => {
    const writeXlsxFile = (await import("write-excel-file/node")).default;
    const workbook = await writeXlsxFile(
      [
        [
          ["name", "city"],
          ["Ada", "London"],
        ],
        [
          ["name", "city"],
          ["Grace", "New York"],
        ],
      ],
      {
        buffer: true,
        sheets: ["People", "Team"],
      }
    );

    const chunks = await extractTabularRowChunks(workbook, "xlsx");

    expect(chunks).toEqual([
      "sheet: People; name: Ada; city: London",
      "sheet: Team; name: Grace; city: New York",
    ]);
  });
});
