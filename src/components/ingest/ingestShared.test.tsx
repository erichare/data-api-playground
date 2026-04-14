// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FileIcon,
  TypeBadge,
  fileKey,
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
    expect(getFileType("README")).toBe("txt");
    expect(getFileType("archive.unknown")).toBe("txt");
  });

  it("returns the lightweight mock document list by collection", () => {
    expect(getMockDocuments("dap_documents")).toHaveLength(5);
    expect(getMockDocuments("customers")).toEqual([]);
  });

  it("builds stable file keys and renders file affordances across types", () => {
    const file = new File(["spreadsheet"], "quarterly.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(fileKey(file)).toBe("quarterly.xlsx__11");

    const { container } = render(
      <div>
        {(["pdf", "docx", "md", "csv", "xlsx", "json", "txt"] as const).map(
          (type) => (
            <div key={type}>
              <FileIcon type={type} />
              <TypeBadge type={type} />
            </div>
          )
        )}
      </div>
    );

    expect(screen.getByText("pdf")).toBeTruthy();
    expect(screen.getByText("xlsx")).toBeTruthy();
    expect(screen.getByText("json")).toBeTruthy();
    expect(container.querySelectorAll("svg")).toHaveLength(7);
  });
});
