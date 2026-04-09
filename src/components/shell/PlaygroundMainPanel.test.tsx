// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaygroundMainPanel } from "./PlaygroundMainPanel";

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
  IngestTab: ({ activeCollection }: { activeCollection: string }) => (
    <div data-testid="ingest-tab">{activeCollection}</div>
  ),
}));

vi.mock("@/components/api/ApiExplorer", () => ({
  ApiExplorer: ({ collection }: { collection?: { name: string } }) => (
    <div data-testid="api-explorer">{collection?.name ?? "none"}</div>
  ),
}));

function renderPanel(overrides: Partial<Parameters<typeof PlaygroundMainPanel>[0]> = {}) {
  const onViewModeChange = vi.fn();

  const utils = render(
    <PlaygroundMainPanel
      viewMode="chat"
      onViewModeChange={onViewModeChange}
      activeCollection="orders"
      activeCollectionObj={{
        name: "orders",
        count: 10,
        vectorDim: 768,
        vectorizeService: { provider: "nvidia", modelName: "NV-Embed-QA" },
      }}
      collections={[
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
      ]}
      collectionFields={{ orders: ["customer_id", "total_spend"] }}
      conversations={[]}
      activeConversationId="conv-1"
      messages={[]}
      onMessagesUpdate={vi.fn()}
      astraToken=""
      astraEndpoint=""
      keyspace="default_keyspace"
      huggingfaceApiKey=""
      initializing={false}
      isConnected={true}
      {...overrides}
    />
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
    renderPanel({ viewMode: "ingest" });

    expect(screen.getByTestId("ingest-tab").textContent).toBe("orders");
    expect(screen.queryByTestId("chat-area")).toBeNull();
  });

  it("renders the API explorer when api mode is selected", () => {
    renderPanel({ viewMode: "api" });

    expect(screen.getByTestId("api-explorer").textContent).toBe("orders");
    expect(screen.queryByTestId("chat-area")).toBeNull();
  });
});
