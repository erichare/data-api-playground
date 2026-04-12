// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewCollectionDialog } from "./NewCollectionDialog";

const { useCollectionFormMock } = vi.hoisted(() => ({
  useCollectionFormMock: vi.fn(),
}));

vi.mock("framer-motion", () => {
  const cleanProps = (props: Record<string, unknown>) => {
    const {
      initial,
      animate,
      exit,
      transition,
      whileHover,
      whileTap,
      ...rest
    } = props;

    void initial;
    void animate;
    void exit;
    void transition;
    void whileHover;
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
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock("@/components/collection/hooks/useCollectionForm", () => ({
  useCollectionForm: useCollectionFormMock,
}));

vi.mock("@/components/collection/CollectionCodePreview", () => ({
  CollectionCodePreview: (props: {
    name: string;
    mode: string;
    dimension: number;
    metric: string;
    provider: string;
    model: string;
  }) => (
    <div data-testid="collection-code-preview">
      {JSON.stringify(props)}
    </div>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFormState(overrides: Record<string, any> = {}) {
  return {
    ...buildFormState(),
    ...overrides,
  } as ReturnType<typeof buildFormState>;
}

function buildFormState() {
  return {
    name: "orders",
    setName: vi.fn(),
    mode: "vectorize" as const,
    setMode: vi.fn(),
    providerModels: [
      {
        provider: "nvidia",
        providerDisplayName: "NVIDIA",
        modelName: "NV-Embed-QA",
        vectorDimension: 1024,
      },
    ],
    selectedModelIdx: 0,
    setSelectedModelIdx: vi.fn(),
    loadingProviders: false,
    providersError: "",
    dimension: 768,
    setDimension: vi.fn(),
    metric: "cosine" as const,
    setMetric: vi.fn(),
    loading: false,
    error: "",
    isConnected: true,
    selectedModel: {
      provider: "nvidia",
      modelName: "NV-Embed-QA",
      vectorDimension: 1024,
    },
    canSubmit: true,
    handleCreate: vi.fn(),
  };
}

describe("NewCollectionDialog", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when closed", () => {
    useCollectionFormMock.mockReturnValue(makeFormState());

    render(
      <NewCollectionDialog
        open={false}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />
    );

    expect(screen.queryByText("New Collection")).toBeNull();
  });

  it("renders vectorize mode and wires dialog actions through the hook", () => {
    const onClose = vi.fn();
    const formState = makeFormState();
    useCollectionFormMock.mockReturnValue(formState);

    render(
      <NewCollectionDialog
        open={true}
        onClose={onClose}
        onCreated={vi.fn()}
        astraToken="AstraCS:secret"
        astraEndpoint="https://db.apps.astra.datastax.com"
        keyspace="default_keyspace"
        isConnected={true}
      />
    );

    expect(screen.getByText("New Collection")).toBeTruthy();
    expect(screen.getByText("Embedding Model")).toBeTruthy();
    expect(screen.getByText(/Vector dimension:/)).toBeTruthy();
    expect(screen.getByTestId("collection-code-preview").textContent).toContain('"mode":"vectorize"');

    fireEvent.change(screen.getByDisplayValue("orders"), {
      target: { value: "customers" },
    });
    expect(formState.setName).toHaveBeenCalledWith("customers");

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "0" },
    });
    expect(formState.setSelectedModelIdx).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByText("Create Collection"));
    expect(formState.handleCreate).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders client mode controls, validation errors, and demo mode messaging", () => {
    const formState = makeFormState({
      mode: "client" as const,
      isConnected: false,
      canSubmit: false,
      error: "Collection already exists",
      selectedModel: null,
    });
    useCollectionFormMock.mockReturnValue(formState);

    render(
      <NewCollectionDialog
        open={true}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        isConnected={false}
      />
    );

    expect(screen.getByText("Vector Dimension")).toBeTruthy();
    expect(screen.getByText("Similarity Metric")).toBeTruthy();
    expect(screen.getByText("Demo mode — not saved to Astra DB")).toBeTruthy();
    expect(screen.getByText("Collection already exists")).toBeTruthy();

    fireEvent.click(screen.getByText("Client-Side"));
    expect(formState.setMode).toHaveBeenCalledWith("client");

    fireEvent.change(screen.getByDisplayValue("768"), {
      target: { value: "1536" },
    });
    expect(formState.setDimension).toHaveBeenCalledWith(1536);

    fireEvent.change(screen.getByDisplayValue("cosine"), {
      target: { value: "dot_product" },
    });
    expect(formState.setMetric).toHaveBeenCalledWith("dot_product");

    expect(
      (screen.getByText("Create Collection").closest("button") as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
