// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RawCollectionBrowser } from "./RawCollectionBrowser";

const { useRawCollectionBrowserMock } = vi.hoisted(() => ({
  useRawCollectionBrowserMock: vi.fn(),
}));

vi.mock("framer-motion", () => {
  const cleanProps = (props: Record<string, unknown>) => {
    const {
      initial,
      animate,
      exit,
      transition,
      layout,
      ...rest
    } = props;

    void initial;
    void animate;
    void exit;
    void transition;
    void layout;
    return rest;
  };

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...cleanProps(props)}>{children}</div>
      ),
    },
  };
});

vi.mock("@/components/ingest/hooks/useRawCollectionBrowser", () => ({
  useRawCollectionBrowser: useRawCollectionBrowserMock,
}));

function renderBrowser(
  overrides: Partial<ReturnType<typeof useRawCollectionBrowserMock>> = {},
  props: Partial<Parameters<typeof RawCollectionBrowser>[0]> = {}
) {
  const setRawOpen = vi.fn();
  const resetAndLoadFirstPage = vi.fn();
  const goToPreviousPage = vi.fn();
  const goToNextPage = vi.fn();

  useRawCollectionBrowserMock.mockReturnValue({
    rawOpen: true,
    setRawOpen,
    rawDocs: [
      {
        _id: "doc-1",
        title: "Quarterly Report",
        score: 98,
        active: true,
        $vector: "__vector_3__",
      },
    ],
    loadingRaw: false,
    rawError: "",
    rawPageState: "next-page",
    rawPageIndex: 1,
    resetAndLoadFirstPage,
    goToPreviousPage,
    goToNextPage,
    ...overrides,
  });

  const utils = render(
    <RawCollectionBrowser
      isConnected={true}
      selectedCollection="orders"
      astraToken="AstraCS:secret"
      astraEndpoint="https://db-id-us-east1.apps.astra.datastax.com"
      keyspace="default_keyspace"
      {...props}
    />
  );

  return { ...utils, setRawOpen, resetAndLoadFirstPage, goToPreviousPage, goToNextPage };
}

describe("RawCollectionBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("toggles the raw browser open state and wires pagination actions", () => {
    const { setRawOpen, goToPreviousPage, goToNextPage, resetAndLoadFirstPage } =
      renderBrowser();

    fireEvent.click(screen.getByText("Raw Collection"));
    expect(setRawOpen).toHaveBeenCalledWith(expect.any(Function));

    fireEvent.click(screen.getByText("← Prev"));
    fireEvent.click(screen.getByText("Next →"));
    fireEvent.click(screen.getByTitle("Refresh"));

    expect(goToPreviousPage).toHaveBeenCalledTimes(1);
    expect(goToNextPage).toHaveBeenCalledTimes(1);
    expect(resetAndLoadFirstPage).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 documents (page 2)")).toBeTruthy();
  });

  it("renders disconnected, loading, error, and empty states", () => {
    const { rerender } = renderBrowser({}, { isConnected: false });

    expect(
      screen.getByText("Connect to Astra DB to browse raw documents")
    ).toBeTruthy();

    useRawCollectionBrowserMock.mockReturnValue({
      rawOpen: true,
      setRawOpen: vi.fn(),
      rawDocs: [],
      loadingRaw: true,
      rawError: "",
      rawPageState: null,
      rawPageIndex: 0,
      resetAndLoadFirstPage: vi.fn(),
      goToPreviousPage: vi.fn(),
      goToNextPage: vi.fn(),
    });
    rerender(
      <RawCollectionBrowser
        isConnected={true}
        selectedCollection="orders"
        astraToken="AstraCS:secret"
        astraEndpoint="https://db-id-us-east1.apps.astra.datastax.com"
        keyspace="default_keyspace"
      />
    );
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);

    useRawCollectionBrowserMock.mockReturnValue({
      rawOpen: true,
      setRawOpen: vi.fn(),
      rawDocs: [],
      loadingRaw: false,
      rawError: "browse failed",
      rawPageState: null,
      rawPageIndex: 0,
      resetAndLoadFirstPage: vi.fn(),
      goToPreviousPage: vi.fn(),
      goToNextPage: vi.fn(),
    });
    rerender(
      <RawCollectionBrowser
        isConnected={true}
        selectedCollection="orders"
        astraToken="AstraCS:secret"
        astraEndpoint="https://db-id-us-east1.apps.astra.datastax.com"
        keyspace="default_keyspace"
      />
    );
    expect(screen.getByText("browse failed")).toBeTruthy();

    useRawCollectionBrowserMock.mockReturnValue({
      rawOpen: true,
      setRawOpen: vi.fn(),
      rawDocs: [],
      loadingRaw: false,
      rawError: "",
      rawPageState: null,
      rawPageIndex: 0,
      resetAndLoadFirstPage: vi.fn(),
      goToPreviousPage: vi.fn(),
      goToNextPage: vi.fn(),
    });
    rerender(
      <RawCollectionBrowser
        isConnected={true}
        selectedCollection="orders"
        astraToken="AstraCS:secret"
        astraEndpoint="https://db-id-us-east1.apps.astra.datastax.com"
        keyspace="default_keyspace"
      />
    );
    expect(screen.getByText("No documents in this collection")).toBeTruthy();
  });

  it("expands raw document rows and shows vector metadata", () => {
    renderBrowser();

    expect(screen.getAllByText("3d").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Quarterly Report"));

    expect(screen.getByText("[3 dimensions]")).toBeTruthy();
    expect(screen.getByText("score")).toBeTruthy();
    expect(screen.getByText("98")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
    expect(screen.getByText("true")).toBeTruthy();
  });
});
