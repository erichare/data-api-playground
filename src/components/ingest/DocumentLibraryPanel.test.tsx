// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentLibraryPanel } from "./DocumentLibraryPanel";

vi.mock("framer-motion", () => {
  const cleanProps = (props: Record<string, unknown>) => {
    const {
      initial,
      animate,
      exit,
      transition,
      whileHover,
      whileTap,
      layout,
      ...rest
    } = props;

    void initial;
    void animate;
    void exit;
    void transition;
    void whileHover;
    void whileTap;
    void layout;
    return rest;
  };

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...cleanProps(props)}>{children}</div>
      ),
      button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...cleanProps(props)}>{children}</button>
      ),
    },
  };
});

const baseDoc = {
  source_doc_id: "doc-1-very-long-identifier",
  source_filename: "report.pdf",
  file_type: "pdf" as const,
  file_size: 2048,
  content_hash: "hash",
  chunk_total: 3,
  ingested_at: "2026-04-11T12:00:00.000Z",
  collection: "orders",
};

function renderPanel(overrides: Partial<Parameters<typeof DocumentLibraryPanel>[0]> = {}) {
  const setSearch = vi.fn();
  const setFilterType = vi.fn();
  const loadDocuments = vi.fn();
  const onDelete = vi.fn();
  const onView = vi.fn();

  const utils = render(
    <DocumentLibraryPanel
      filteredDocs={[baseDoc]}
      loadingDocs={false}
      loadError=""
      search=""
      setSearch={setSearch}
      filterType="all"
      setFilterType={setFilterType}
      loadDocuments={loadDocuments}
      deletingId={null}
      onDelete={onDelete}
      onView={onView}
      isConnected={true}
      {...overrides}
    />
  );

  return { ...utils, setSearch, setFilterType, loadDocuments, onDelete, onView };
}

describe("DocumentLibraryPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("updates search and filter controls and refreshes the library", () => {
    const { setSearch, setFilterType, loadDocuments } = renderPanel();

    fireEvent.change(screen.getByPlaceholderText("Search files…"), {
      target: { value: "report" },
    });
    fireEvent.change(screen.getByDisplayValue("All types"), {
      target: { value: "pdf" },
    });
    fireEvent.click(screen.getByTitle("Refresh"));

    expect(setSearch).toHaveBeenCalledWith("report");
    expect(setFilterType).toHaveBeenCalledWith("pdf");
    expect(loadDocuments).toHaveBeenCalledTimes(1);
  });

  it("renders loading, error, and empty states", () => {
    const { rerender } = renderPanel({
      loadingDocs: true,
      filteredDocs: [],
    });

    expect(screen.getByText("Loading documents…")).toBeTruthy();

    rerender(
      <DocumentLibraryPanel
        filteredDocs={[]}
        loadingDocs={false}
        loadError="load failed"
        search=""
        setSearch={vi.fn()}
        filterType="all"
        setFilterType={vi.fn()}
        loadDocuments={vi.fn()}
        deletingId={null}
        onDelete={vi.fn()}
        onView={vi.fn()}
        isConnected={true}
      />
    );

    expect(screen.getByText("load failed")).toBeTruthy();
    expect(screen.getByText("No documents yet")).toBeTruthy();
  });

  it("shows the demo-mode footer when disconnected", () => {
    renderPanel({ isConnected: false });

    expect(
      screen.getByText("Demo mode — connect to Astra DB to persist documents")
    ).toBeTruthy();
  });

  it("opens a document on row click and deletes it from the hover action", () => {
    const { onDelete, onView } = renderPanel();

    const filename = screen.getByText("report.pdf");
    const row = filename.closest(".cursor-pointer");
    if (!row) throw new Error("Expected a document row");

    fireEvent.click(filename);
    expect(onView).toHaveBeenCalledWith(baseDoc);

    fireEvent.mouseEnter(row);
    fireEvent.click(screen.getByTitle("Delete document"));
    expect(onDelete).toHaveBeenCalledWith(baseDoc);
  });
});
