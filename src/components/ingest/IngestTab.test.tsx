// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IngestTab } from "./IngestTab";

const { useDocumentLibraryMock, useIngestUploadMock } = vi.hoisted(() => ({
  useDocumentLibraryMock: vi.fn(),
  useIngestUploadMock: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ingest/hooks/useDocumentLibrary", () => ({
  useDocumentLibrary: useDocumentLibraryMock,
}));

vi.mock("@/components/ingest/hooks/useIngestUpload", () => ({
  useIngestUpload: useIngestUploadMock,
}));

vi.mock("@/components/ingest/IngestUploadPanel", () => ({
  IngestUploadPanel: ({
    selectedCollection,
    uploading,
    onIngest,
    onResolveConflict,
  }: {
    selectedCollection: string;
    uploading: boolean;
    onIngest: () => void;
    onResolveConflict: (file: unknown, action: string, applyToAll: boolean) => void;
  }) => (
    <div data-testid="ingest-upload-panel">
      {JSON.stringify({ selectedCollection, uploading })}
      <button onClick={onIngest}>Ingest now</button>
      <button onClick={() => onResolveConflict("report.pdf", "replace", true)}>
        Resolve conflict
      </button>
    </div>
  ),
}));

vi.mock("@/components/ingest/DocumentLibraryPanel", () => ({
  DocumentLibraryPanel: ({
    filteredDocs,
    isConnected,
    loadDocuments,
  }: {
    filteredDocs: Array<{ source_doc_id: string }>;
    isConnected: boolean;
    loadDocuments: () => void;
  }) => (
    <div data-testid="document-library-panel">
      {JSON.stringify({ docIds: filteredDocs.map((doc) => doc.source_doc_id), isConnected })}
      <button onClick={loadDocuments}>Reload docs</button>
    </div>
  ),
}));

vi.mock("@/components/ingest/RawCollectionBrowser", () => ({
  RawCollectionBrowser: ({
    selectedCollection,
  }: {
    selectedCollection: string;
  }) => <div data-testid="raw-collection-browser">{selectedCollection}</div>,
}));

vi.mock("@/components/ingest/DocumentViewer", () => ({
  DocumentViewer: ({
    doc,
    onClose,
  }: {
    doc: { source_doc_id: string };
    onClose: () => void;
  }) => (
    <div data-testid="document-viewer">
      {doc.source_doc_id}
      <button onClick={onClose}>Close viewer</button>
    </div>
  ),
}));

const doc = {
  source_doc_id: "doc-1",
  source_filename: "report.pdf",
  file_type: "pdf" as const,
  file_size: 1024,
  content_hash: "hash",
  chunk_total: 2,
  ingested_at: "2026-04-11T00:00:00.000Z",
  collection: "orders",
};

function mockDocumentLibrary(overrides: Partial<ReturnType<typeof useDocumentLibraryMock>> = {}) {
  useDocumentLibraryMock.mockReturnValue({
    loadingDocs: false,
    loadError: "",
    search: "",
    setSearch: vi.fn(),
    filterType: "all",
    setFilterType: vi.fn(),
    deletingId: null,
    viewingDoc: null,
    setViewingDoc: vi.fn(),
    filteredDocs: [doc],
    loadDocuments: vi.fn(),
    handleDelete: vi.fn(),
    prependDocument: vi.fn(),
    replaceDocumentsByIds: vi.fn(),
    ...overrides,
  });
}

function mockIngestUpload(overrides: Partial<ReturnType<typeof useIngestUploadMock>> = {}) {
  useIngestUploadMock.mockReturnValue({
    isDragOver: false,
    setIsDragOver: vi.fn(),
    queuedFiles: [],
    fileStatuses: {},
    uploading: false,
    addFiles: vi.fn(),
    removeFile: vi.fn(),
    handleIngest: vi.fn(),
    resolveConflict: vi.fn(),
    ...overrides,
  });
}

function renderTab(overrides: Partial<Parameters<typeof IngestTab>[0]> = {}) {
  return render(
    <IngestTab
      astraToken="AstraCS:secret"
      astraEndpoint="https://db-id-us-east1.apps.astra.datastax.com"
      keyspace="default_keyspace"
      collections={[
        { name: "dap_internal", count: 1, vectorDim: 768, vectorizeService: null },
        { name: "orders", count: 12, vectorDim: 768, vectorizeService: null },
        { name: "customers", count: 4, vectorDim: null, vectorizeService: null },
      ]}
      activeCollection={undefined}
      huggingfaceApiKey="hf-key"
      isConnected={true}
      {...overrides}
    />
  );
}

describe("IngestTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocumentLibrary();
    mockIngestUpload();
  });

  afterEach(() => {
    cleanup();
  });

  it("prefers the active collection when one is selected", () => {
    const onCollectionStatsDelta = vi.fn();
    renderTab({ activeCollection: "customers", onCollectionStatsDelta });

    expect(useDocumentLibraryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedCollection: "customers",
        onCollectionStatsDelta,
      })
    );
    expect(useIngestUploadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedCollection: "customers",
        huggingfaceApiKey: "hf-key",
      })
    );
    expect(screen.getByTestId("raw-collection-browser").textContent).toBe("customers");
  });

  it("falls back to the first non-internal collection when no active collection is set", () => {
    renderTab();

    expect(useDocumentLibraryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedCollection: "orders",
        isConnected: true,
      })
    );
    expect(screen.getByTestId("ingest-upload-panel").textContent).toContain("orders");
    expect(screen.getByTestId("document-library-panel").textContent).toContain("doc-1");
  });

  it("shows the document viewer when a document is selected", () => {
    mockDocumentLibrary({ viewingDoc: doc });

    renderTab();

    expect(screen.getByTestId("document-viewer").textContent).toContain("doc-1");
  });

  it("falls back to the first collection when only internal collections exist", () => {
    renderTab({
      collections: [{ name: "dap_internal", count: 1, vectorDim: 768, vectorizeService: null }],
    });

    expect(useDocumentLibraryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedCollection: "dap_internal",
      })
    );
  });

  it("wires ingest, reload, and close callbacks through to the hook helpers", () => {
    const handleIngest = vi.fn();
    const resolveConflict = vi.fn();
    const loadDocuments = vi.fn();
    const setViewingDoc = vi.fn();

    mockDocumentLibrary({
      viewingDoc: doc,
      loadDocuments,
      setViewingDoc,
    });
    mockIngestUpload({
      handleIngest,
      resolveConflict,
    });

    renderTab();

    fireEvent.click(screen.getByText("Ingest now"));
    fireEvent.click(screen.getByText("Resolve conflict"));
    fireEvent.click(screen.getByText("Reload docs"));
    fireEvent.click(screen.getByText("Close viewer"));

    expect(handleIngest).toHaveBeenCalledTimes(1);
    expect(resolveConflict).toHaveBeenCalledWith("report.pdf", "replace", true);
    expect(loadDocuments).toHaveBeenCalledTimes(1);
    expect(setViewingDoc).toHaveBeenCalledWith(null);
  });
});
