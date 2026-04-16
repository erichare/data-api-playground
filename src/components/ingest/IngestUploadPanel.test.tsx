// @vitest-environment jsdom
/* eslint-disable security/detect-non-literal-regexp -- Test assertions build regexes from controlled fixture strings only. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileKey } from "@/components/ingest/ingestShared";
import { MAX_DOCUMENT_UPLOAD_MB } from "@/lib/ingest/constants";
import { IngestUploadPanel } from "./IngestUploadPanel";

vi.mock("framer-motion", () => {
  const cleanProps = (props: Record<string, unknown>) => {
    const {
      initial,
      animate,
      exit,
      transition,
      whileTap,
      layout,
      ...rest
    } = props;

    void initial;
    void animate;
    void exit;
    void transition;
    void whileTap;
    void layout;
    return rest;
  };

  return {
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...cleanProps(props)}>{children}</div>
      ),
      button: ({
        children,
        ...props
      }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...cleanProps(props)}>{children}</button>
      ),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

function makeProps(overrides: Partial<Parameters<typeof IngestUploadPanel>[0]> = {}) {
  return {
    isDragOver: false,
    setIsDragOver: vi.fn(),
    queuedFiles: [],
    fileStatuses: new Map(),
    selectedCollection: "orders",
    uploading: false,
    onFilesAdded: vi.fn(),
    onRemoveFile: vi.fn(),
    onIngest: vi.fn(),
    onResolveConflict: vi.fn(),
    ...overrides,
  };
}

describe("IngestUploadPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("accepts files from drag-and-drop and the hidden file input", () => {
    const props = makeProps();
    const { container } = render(<IngestUploadPanel {...props} />);

    const fileInput = container.querySelector('input[type="file"]');
    const uploadZone = fileInput?.parentElement;
    const pdfFile = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const mdFile = new File(["# notes"], "notes.md", { type: "text/markdown" });

    if (!uploadZone || !fileInput) {
      throw new Error("Expected upload zone and file input to be rendered");
    }

    const fileInputClick = vi.spyOn(fileInput as HTMLElement, "click");

    fireEvent.dragOver(uploadZone, {
      preventDefault: vi.fn(),
    });
    fireEvent.dragLeave(uploadZone);
    fireEvent.drop(uploadZone, {
      preventDefault: vi.fn(),
      dataTransfer: { files: [pdfFile, mdFile] },
    });
    fireEvent.change(fileInput, {
      target: { files: [pdfFile] },
    });
    fireEvent.click(uploadZone);

    expect(props.setIsDragOver).toHaveBeenNthCalledWith(1, true);
    expect(props.setIsDragOver).toHaveBeenNthCalledWith(2, false);
    expect(props.setIsDragOver).toHaveBeenNthCalledWith(3, false);
    expect(props.onFilesAdded).toHaveBeenNthCalledWith(1, [pdfFile, mdFile]);
    expect(props.onFilesAdded).toHaveBeenNthCalledWith(2, [pdfFile]);
    expect(fileInputClick).toHaveBeenCalled();
  });

  it("renders queued files, progress state, and delegates row removal and ingest actions", () => {
    const pdfFile = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const jsonFile = new File(['{"ok":true}'], "data.json", {
      type: "application/json",
    });

    const props = makeProps({
      queuedFiles: [pdfFile, jsonFile],
      fileStatuses: new Map([
        [fileKey(pdfFile), { stage: "storing", processed: 3, total: 5 }],
        [fileKey(jsonFile), { stage: "error", message: "Parse failed" }],
      ]),
    });

    render(<IngestUploadPanel {...props} />);

    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByText("data.json")).toBeTruthy();
    expect(screen.getByText("3/5")).toBeTruthy();
    expect(screen.getByText("orders")).toBeTruthy();

    const jsonRow = screen.getByText("data.json").closest("div");
    if (!jsonRow) {
      throw new Error("Expected queued file row to be rendered");
    }

    const removeButton = jsonRow.querySelector("button");
    if (!removeButton) {
      throw new Error("Expected queued file remove button to be rendered");
    }

    fireEvent.click(removeButton);
    fireEvent.click(screen.getByRole("button", { name: "Ingest 2 Files" }));

    expect(props.onRemoveFile).toHaveBeenCalledWith(jsonFile);
    expect(props.onIngest).toHaveBeenCalled();
  });

  it("shows the uploading state and disables ingest when processing", () => {
    render(
      <IngestUploadPanel
        {...makeProps({
          queuedFiles: [new File(["doc"], "draft.txt", { type: "text/plain" })],
          uploading: true,
        })}
      />
    );

    expect(screen.getByRole("button", { name: /Processing…/ }).hasAttribute("disabled")).toBe(
      true
    );
  });

  it("shows the supported file types and max upload size", () => {
    render(<IngestUploadPanel {...makeProps()} />);

    expect(
      screen.getByText(new RegExp(`Up to ${MAX_DOCUMENT_UPLOAD_MB} MB`))
    ).toBeTruthy();
  });

  it("shows drag-over copy, a placeholder collection, and the single-file ingest CTA", () => {
    render(
      <IngestUploadPanel
        {...makeProps({
          isDragOver: true,
          queuedFiles: [new File(["doc"], "draft.txt", { type: "text/plain" })],
          selectedCollection: "",
        })}
      />
    );

    expect(screen.getByText("Drop to upload")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ingest Document" })).toBeTruthy();
  });

  it("renders preparing, extracting, and completed states while hiding remove buttons during upload", () => {
    const extractingFile = new File(["extract"], "extract.pdf", {
      type: "application/pdf",
    });
    const preparingFile = new File(["prepare"], "prepare.pdf", {
      type: "application/pdf",
    });
    const completeFile = new File(["done"], "done.pdf", { type: "application/pdf" });

    const { container } = render(
      <IngestUploadPanel
        {...makeProps({
          queuedFiles: [extractingFile, preparingFile, completeFile],
          uploading: true,
          fileStatuses: new Map([
            [fileKey(extractingFile), { stage: "extracting" }],
            [
              fileKey(preparingFile),
              {
                stage: "preparing",
                message: "Downloading layers",
                model: "granite3.1-dense:8b",
                completed: 4096,
                total: 8192,
                determinate: true,
              },
            ],
            [fileKey(completeFile), { stage: "done", chunks: 2 }],
          ]),
        })}
      />
    );

    expect(screen.getByText("Downloading granite3.1-dense:8b")).toBeTruthy();
    expect(screen.getByText("Downloading layers. First run can take several GB and a few minutes.")).toBeTruthy();
    expect(screen.getByText("4.0 KB/8.0 KB")).toBeTruthy();
    expect(container.querySelectorAll(".animate-spin").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole("button").length).toBe(1);
  });

  it("renders filename conflicts with overwrite, skip, and apply-to-all controls", () => {
    const conflictFile = new File(["new"], "report.pdf", {
      type: "application/pdf",
    });
    const props = makeProps({
      queuedFiles: [conflictFile],
      fileStatuses: new Map([
        [
          fileKey(conflictFile),
          {
            stage: "conflict",
            message:
              'A different "report.pdf" is already ingested in this collection. Overwrite it or skip this upload.',
          },
        ],
      ]),
    });

    render(<IngestUploadPanel {...props} />);

    fireEvent.click(screen.getByLabelText("Apply to later filename conflicts in this queue"));
    fireEvent.click(screen.getByRole("button", { name: "Overwrite" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(props.onResolveConflict).toHaveBeenNthCalledWith(
      1,
      conflictFile,
      "overwrite",
      true
    );
    expect(props.onResolveConflict).toHaveBeenNthCalledWith(
      2,
      conflictFile,
      "skip",
      true
    );
  });

  it("renders skipped uploads with their skip reason", () => {
    const skippedFile = new File(["same"], "report.pdf", {
      type: "application/pdf",
    });

    render(
      <IngestUploadPanel
        {...makeProps({
          queuedFiles: [skippedFile],
          fileStatuses: new Map([
            [
              fileKey(skippedFile),
              {
                stage: "skipped",
                message:
                  'Already ingested as "report.pdf" on 4/9/2026, 8:00:00 PM; skipping duplicate upload.',
              },
            ],
          ]),
        })}
      />
    );

    expect(screen.getByText(/skipping duplicate upload/i)).toBeTruthy();
  });
});
