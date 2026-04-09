// @vitest-environment jsdom

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

    expect(props.setIsDragOver).toHaveBeenNthCalledWith(1, true);
    expect(props.setIsDragOver).toHaveBeenNthCalledWith(2, false);
    expect(props.setIsDragOver).toHaveBeenNthCalledWith(3, false);
    expect(props.onFilesAdded).toHaveBeenNthCalledWith(1, [pdfFile, mdFile]);
    expect(props.onFilesAdded).toHaveBeenNthCalledWith(2, [pdfFile]);
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
});
