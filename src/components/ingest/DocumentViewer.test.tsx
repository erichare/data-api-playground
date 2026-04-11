// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentViewer } from "./DocumentViewer";

const { useDocumentChunksMock } = vi.hoisted(() => ({
  useDocumentChunksMock: vi.fn(),
}));

vi.mock("framer-motion", () => {
  const cleanProps = (props: Record<string, unknown>) => {
    const {
      initial,
      animate,
      exit,
      transition,
      whileTap,
      ...rest
    } = props;

    void initial;
    void animate;
    void exit;
    void transition;
    void whileTap;
    return rest;
  };

  return {
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

vi.mock("@/components/ingest/hooks/useDocumentChunks", () => ({
  useDocumentChunks: useDocumentChunksMock,
}));

const doc = {
  source_doc_id: "doc-1",
  source_filename: "report.pdf",
  file_type: "pdf" as const,
  file_size: 2048,
  md5_hash: "hash",
  chunk_total: 2,
  ingested_at: "2026-04-11T12:00:00.000Z",
  collection: "orders",
};

function renderViewer(overrides: Partial<ReturnType<typeof useDocumentChunksMock>> = {}) {
  const onClose = vi.fn();
  useDocumentChunksMock.mockReturnValue({
    chunks: [],
    loading: false,
    error: "",
    copied: false,
    copyAll: vi.fn(),
    ...overrides,
  });

  const utils = render(
    <DocumentViewer
      doc={doc}
      astraToken="AstraCS:secret"
      astraEndpoint="https://db-id-us-east1.apps.astra.datastax.com"
      keyspace="default_keyspace"
      isConnected={true}
      onClose={onClose}
    />
  );

  return { ...utils, onClose };
}

describe("DocumentViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows loading and disconnected states", () => {
    const { rerender } = renderViewer({ loading: true });

    expect(screen.getByText("Loading chunks…")).toBeTruthy();

    useDocumentChunksMock.mockReturnValue({
      chunks: [],
      loading: false,
      error: "",
      copied: false,
      copyAll: vi.fn(),
    });

    rerender(
      <DocumentViewer
        doc={doc}
        astraToken=""
        astraEndpoint=""
        keyspace="default_keyspace"
        isConnected={false}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText("Connect to Astra DB to view document content")
    ).toBeTruthy();
  });

  it("renders error and empty states", () => {
    const { rerender } = renderViewer({ error: "chunk lookup failed" });

    expect(screen.getByText("chunk lookup failed")).toBeTruthy();

    useDocumentChunksMock.mockReturnValue({
      chunks: [],
      loading: false,
      error: "",
      copied: false,
      copyAll: vi.fn(),
    });

    rerender(
      <DocumentViewer
        doc={doc}
        astraToken="AstraCS:secret"
        astraEndpoint="https://db-id-us-east1.apps.astra.datastax.com"
        keyspace="default_keyspace"
        isConnected={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("No chunks found")).toBeTruthy();
  });

  it("renders chunks, supports copy-all, and closes via button, backdrop, and escape", () => {
    const copyAll = vi.fn();
    const { onClose } = renderViewer({
      chunks: [
        { chunk_index: 0, content: "First chunk" },
        { chunk_index: 1, content: "Second chunk" },
      ],
      copyAll,
      copied: false,
    });

    expect(screen.getByText("chunk 1 / 2")).toBeTruthy();
    expect(screen.getByText("First chunk")).toBeTruthy();

    fireEvent.click(screen.getByText("Copy all"));
    expect(copyAll).toHaveBeenCalledTimes(1);

    const overlay = screen.getByText("report.pdf").closest(".fixed");
    if (!overlay) throw new Error("Expected backdrop overlay");
    fireEvent.click(screen.getByText("First chunk"));
    expect(onClose).not.toHaveBeenCalled();

    const closeButtons = screen.getAllByRole("button");
    fireEvent.click(closeButtons.at(-1) as HTMLButtonElement);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("shows the copied state label when the hook reports success", () => {
    renderViewer({
      chunks: [{ chunk_index: 0, content: "Only chunk" }],
      copied: true,
    });

    expect(screen.getByText("Copied")).toBeTruthy();
  });
});
