// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaygroundMainPanel } from "./PlaygroundMainPanel";
import { ConnectionProvider, type ConnectionContextValue } from "@/lib/context/ConnectionContext";

vi.mock("@/components/shell/ViewModeSwitcher", () => ({
  ViewModeSwitcher: ({
    viewMode,
    onChange,
  }: {
    viewMode: string;
    onChange: (mode: "api" | "ingest" | "chat") => void;
  }) => (
    <div>
      <div data-testid="view-mode">{viewMode}</div>
      <button onClick={() => onChange("api")}>Switch To Api</button>
    </div>
  ),
}));

vi.mock("@/components/chat/ChatArea", () => ({
  ChatArea: ({
    collections,
    activeConversationId,
  }: {
    collections: Array<{
      name: string;
      isVectorize: boolean;
      vectorDimension?: number | null;
    }>;
    activeConversationId: string;
  }) => (
    <div data-testid="chat-area">
      {JSON.stringify({ collections, activeConversationId })}
    </div>
  ),
}));

vi.mock("@/components/ingest/IngestTab", () => ({
  IngestTab: ({
    activeCollection,
    onCollectionStatsDelta,
  }: {
    activeCollection: string;
    onCollectionStatsDelta?: () => void;
  }) => (
    <div data-testid="ingest-tab">
      {JSON.stringify({
        activeCollection,
        hasCollectionStatsDelta: typeof onCollectionStatsDelta === "function",
      })}
    </div>
  ),
}));

vi.mock("@/components/api/ApiExplorer", () => ({
  ApiExplorer: ({ collection }: { collection?: { name: string } }) => (
    <div data-testid="api-explorer">{collection?.name ?? "none"}</div>
  ),
}));

const defaultConnection: ConnectionContextValue = {
  astraToken: "",
  astraEndpoint: "",
  keyspace: "default_keyspace",
  isConnected: true,
  initializing: false,
  collections: [
    {
      name: "orders",
      count: 10,
      vectorDim: 768,
      vectorizeService: { provider: "nvidia", modelName: "NV-Embed-QA" },
    },
    {
      name: "customers",
      count: 5,
      vectorDim: 0,
      vectorizeService: null,
    },
  ],
  activeCollection: "orders",
  activeCollectionObj: {
    name: "orders",
    count: 10,
    vectorDim: 768,
    vectorizeService: { provider: "nvidia", modelName: "NV-Embed-QA" },
  },
  collectionFields: { orders: ["customer_id", "total_spend"] },
  huggingfaceApiKey: "",
};

function renderPanel(
  overrides: Partial<Parameters<typeof PlaygroundMainPanel>[0]> = {},
  connectionOverrides: Partial<ConnectionContextValue> = {}
) {
  const onViewModeChange = vi.fn();

  const utils = render(
    <ConnectionProvider value={{ ...defaultConnection, ...connectionOverrides }}>
      <PlaygroundMainPanel
        viewMode="chat"
        onViewModeChange={onViewModeChange}
        conversations={[]}
        activeConversationId="conv-1"
        messages={[]}
        onMessagesUpdate={vi.fn()}
        {...overrides}
      />
    </ConnectionProvider>
  );

  return { ...utils, onViewModeChange };
}

describe("PlaygroundMainPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders ChatArea by default and maps collection vectorization state", () => {
    const { onViewModeChange } = renderPanel();

    expect(screen.getByTestId("chat-area").textContent).toBe(
      JSON.stringify({
        collections: [
          { name: "orders", isVectorize: true, vectorDimension: 768 },
          { name: "customers", isVectorize: false, vectorDimension: 0 },
        ],
        activeConversationId: "conv-1",
      })
    );

    fireEvent.click(screen.getByText("Switch To Api"));
    expect(onViewModeChange).toHaveBeenCalledWith("api");
  });

  it("renders the ingest tab when ingest mode is selected", () => {
    renderPanel({ viewMode: "ingest", onCollectionStatsDelta: vi.fn() });

    expect(screen.getByTestId("ingest-tab").textContent).toBe(
      JSON.stringify({
        activeCollection: "orders",
        hasCollectionStatsDelta: true,
      })
    );
    expect(screen.queryByTestId("chat-area")).toBeNull();
  });

  it("renders the API explorer when api mode is selected", () => {
    renderPanel({ viewMode: "api" });

    expect(screen.getByTestId("api-explorer").textContent).toBe("orders");
    expect(screen.queryByTestId("chat-area")).toBeNull();
  });
});
