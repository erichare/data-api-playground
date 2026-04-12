import { describe, expect, it } from "vitest";
import { chunkText, serializeTabularRow } from "./text";

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
