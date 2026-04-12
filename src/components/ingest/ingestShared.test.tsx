// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FileIcon,
  TypeBadge,
  formatBytes,
  formatDate,
  getFileType,
  getMockDocuments,
} from "./ingestShared";

describe("ingestShared", () => {
  it("formats file sizes and dates for the document library", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatDate("2026-03-25T08:30:00Z")).toBe("Mar 25, 2026");
  });

  it("detects known file types and falls back to txt", () => {
    expect(getFileType("report.pdf")).toBe("pdf");
    expect(getFileType("notes.MD")).toBe("md");
    expect(getFileType("archive.unknown")).toBe("txt");
  });

  it("returns the lightweight mock document list by collection", () => {
    expect(getMockDocuments("dap_documents")).toHaveLength(5);
    expect(getMockDocuments("customers")).toEqual([]);
  });

  it("renders file affordances", () => {
    const { container } = render(
      <div>
        <FileIcon type="pdf" />
        <TypeBadge type="pdf" />
      </div>
    );

    expect(screen.getByText("pdf")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
