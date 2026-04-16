// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaygroundDialogs } from "./PlaygroundDialogs";
import type { BackendConnectionState } from "@/lib/backends/types";

vi.mock("@/components/collection/NewCollectionDialog", () => ({
  NewCollectionDialog: ({
    open,
    keyspace,
    astraToken,
    astraEndpoint,
    isConnected,
    onClose,
    onCreated,
  }: {
    open: boolean;
    keyspace: string;
    astraToken: string;
    astraEndpoint: string;
    isConnected: boolean;
    onClose: () => void;
    onCreated: (collection: { name: string; count: number; vectorDim: number | null }) => void;
  }) => (
    <div data-testid="new-collection-dialog">
      {JSON.stringify({ open, keyspace, astraToken, astraEndpoint, isConnected })}
      <button onClick={onClose}>Close New Collection</button>
      <button
        onClick={() =>
          onCreated({ name: "invoices", count: 0, vectorDim: null })
        }
      >
        Create Collection
      </button>
    </div>
  ),
}));

vi.mock("@/components/onboarding/QuickStartGuide", () => ({
  QuickStartGuide: ({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
  }) => (
    <div data-testid="quickstart-guide">
      {JSON.stringify({ open })}
      <button onClick={onClose}>Close Quickstart</button>
    </div>
  ),
}));

vi.mock("@/components/connection/ConnectionDialog", () => ({
  ConnectionDialog: ({
    open,
    currentConnection,
    currentHuggingfaceApiKey,
    error,
    connected,
    onClose,
    onDisconnect,
    onConnect,
    onHuggingfaceApiKeyChange,
  }: {
    open: boolean;
    currentConnection?: {
      backend: "astra" | "hcd";
      token?: string;
      endpoint: string;
      fromEnv?: boolean;
    } | null;
    currentHuggingfaceApiKey?: string;
    error?: string;
    connected: boolean;
    onClose: () => void;
    onDisconnect: () => void;
    onConnect: (connection: BackendConnectionState) => Promise<void>;
    onHuggingfaceApiKeyChange: (value: string) => void;
  }) => (
    <div data-testid="connect-dialog">
      {JSON.stringify({
        open,
        currentToken:
          currentConnection?.backend === "astra" && !currentConnection.fromEnv
            ? currentConnection.token ?? ""
            : "",
        currentEndpoint:
          currentConnection?.backend === "astra" && !currentConnection.fromEnv
            ? currentConnection.endpoint
            : "",
        currentHuggingfaceApiKey,
        error,
        connected,
      })}
      <button onClick={onClose}>Close Connect</button>
      <button onClick={onDisconnect}>Disconnect</button>
      <button
        onClick={() =>
          void onConnect({
            backend: "astra",
            token: "token",
            endpoint: "endpoint",
          })
        }
      >
        Connect
      </button>
      <button onClick={() => onHuggingfaceApiKeyChange("hf-next")}>
        Update Hugging Face
      </button>
    </div>
  ),
}));

function makeProps(overrides: Partial<Parameters<typeof PlaygroundDialogs>[0]> = {}) {
  return {
    newCollectionOpen: true,
    onCloseNewCollection: vi.fn(),
    onCollectionCreated: vi.fn(),
    astraToken: "AstraCS:secret",
    astraEndpoint: "https://db.apps.astra.datastax.com",
    selectedKeyspace: "default_keyspace",
    quickStartOpen: true,
    onCloseQuickStart: vi.fn(),
    connectDialogOpen: true,
    onCloseConnect: vi.fn(),
    onConnect: vi.fn(async () => undefined),
    onDisconnect: vi.fn(),
    astraFromEnv: false,
    huggingfaceApiKey: "hf-key",
    onHuggingfaceApiKeyChange: vi.fn(),
    connectError: "Connection failed",
    isConnected: true,
    ...overrides,
  };
}

describe("PlaygroundDialogs", () => {
  afterEach(() => {
    cleanup();
  });

  it("forwards explicit Astra credentials to the shell dialogs", async () => {
    const props = makeProps();
    render(<PlaygroundDialogs {...props} />);

    expect(screen.getByTestId("new-collection-dialog").textContent).toContain(
      JSON.stringify({
        open: true,
        keyspace: "default_keyspace",
        astraToken: "AstraCS:secret",
        astraEndpoint: "https://db.apps.astra.datastax.com",
        isConnected: true,
      })
    );
    expect(screen.getByTestId("quickstart-guide").textContent).toContain('{"open":true}');
    expect(screen.getByTestId("connect-dialog").textContent).toContain(
      JSON.stringify({
        open: true,
        currentToken: "AstraCS:secret",
        currentEndpoint: "https://db.apps.astra.datastax.com",
        currentHuggingfaceApiKey: "hf-key",
        error: "Connection failed",
        connected: true,
      })
    );

    fireEvent.click(screen.getByText("Close New Collection"));
    fireEvent.click(screen.getByText("Create Collection"));
    fireEvent.click(screen.getByText("Close Quickstart"));
    fireEvent.click(screen.getByText("Close Connect"));
    fireEvent.click(screen.getByText("Disconnect"));
    fireEvent.click(screen.getByText("Connect"));
    fireEvent.click(screen.getByText("Update Hugging Face"));

    expect(props.onCloseNewCollection).toHaveBeenCalled();
    expect(props.onCollectionCreated).toHaveBeenCalledWith({
      name: "invoices",
      count: 0,
      vectorDim: null,
    });
    expect(props.onCloseQuickStart).toHaveBeenCalled();
    expect(props.onCloseConnect).toHaveBeenCalled();
    expect(props.onDisconnect).toHaveBeenCalled();
    expect(props.onConnect).toHaveBeenCalledWith({
      backend: "astra",
      token: "token",
      endpoint: "endpoint",
    });
    expect(props.onHuggingfaceApiKeyChange).toHaveBeenCalledWith("hf-next");
  });

  it("blanks Astra credentials when env-backed", () => {
    render(
      <PlaygroundDialogs
        {...makeProps({
          astraFromEnv: true,
          connectError: "",
          quickStartOpen: false,
        })}
      />
    );

    expect(screen.getByTestId("quickstart-guide").textContent).toContain('{"open":false}');
    expect(screen.getByTestId("connect-dialog").textContent).toContain(
      JSON.stringify({
        open: true,
        currentToken: "",
        currentEndpoint: "",
        currentHuggingfaceApiKey: "hf-key",
        error: "",
        connected: true,
      })
    );
  });
});
