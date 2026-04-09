// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaygroundPage from "./page";

const { usePlaygroundStateMock } = vi.hoisted(() => ({
  usePlaygroundStateMock: vi.fn(),
}));

vi.mock("@/lib/hooks/usePlaygroundState", () => ({
  usePlaygroundState: usePlaygroundStateMock,
}));

vi.mock("@/components/shell/Header", () => ({
  Header: ({
    authEnabled,
    onSignOut,
    onConnectionClick,
    onSettingsClick,
    onToggleTheme,
  }: {
    authEnabled?: boolean;
    onSignOut?: () => void;
    onConnectionClick?: () => void;
    onSettingsClick?: () => void;
    onToggleTheme?: () => void;
  }) => (
    <div>
      <div data-testid="header-auth-enabled">{String(authEnabled)}</div>
      <button onClick={onConnectionClick}>Header Connect</button>
      <button onClick={onSettingsClick}>Header Settings</button>
      <button onClick={onToggleTheme}>Header Theme</button>
      {authEnabled ? <button onClick={onSignOut}>Header Sign Out</button> : null}
    </div>
  ),
}));

vi.mock("@/components/shell/Sidebar", () => ({
  Sidebar: ({
    onSelectCollection,
    onConversationChange,
    onNewConversation,
  }: {
    onSelectCollection: (name: string) => void;
    onConversationChange: (id: string) => void;
    onNewConversation: () => void;
  }) => (
    <div>
      <button onClick={() => onSelectCollection("orders")}>Select Orders</button>
      <button onClick={() => onConversationChange("conv-2")}>Switch Conversation</button>
      <button onClick={onNewConversation}>New Conversation</button>
    </div>
  ),
}));

vi.mock("@/components/shell/PlaygroundMainPanel", () => ({
  PlaygroundMainPanel: ({ viewMode }: { viewMode: string }) => (
    <div data-testid="main-panel-mode">{viewMode}</div>
  ),
}));

vi.mock("@/components/shell/PlaygroundDialogs", () => ({
  PlaygroundDialogs: ({
    connectDialogOpen,
    quickStartOpen,
  }: {
    connectDialogOpen: boolean;
    quickStartOpen: boolean;
  }) => (
    <div>
      <div data-testid="connect-dialog-open">{String(connectDialogOpen)}</div>
      <div data-testid="quickstart-open">{String(quickStartOpen)}</div>
    </div>
  ),
}));

function createState(overrides: Partial<ReturnType<typeof makeBaseState>> = {}) {
  return {
    ...makeBaseState(),
    ...overrides,
  };
}

function makeBaseState() {
  return {
    astraToken: "",
    astraEndpoint: "",
    astraFromEnv: false,
    huggingfaceApiKey: "",
    handleHuggingfaceApiKeyChange: vi.fn(),
    envReady: false,
    initializing: false,
    isConnected: false,
    connectDialogOpen: false,
    setConnectDialogOpen: vi.fn(),
    connectError: "",
    setConnectError: vi.fn(),
    handleConnect: vi.fn(),
    handleDisconnect: vi.fn(),
    collections: [],
    collectionFields: {},
    activeCollection: "",
    activeCollectionObj: undefined,
    keyspaces: [],
    selectedKeyspace: "default_keyspace",
    handleSelectCollection: vi.fn(),
    handleKeyspaceChange: vi.fn(),
    handleCollectionCreated: vi.fn(),
    viewMode: "chat",
    setViewMode: vi.fn(),
    newCollectionOpen: false,
    setNewCollectionOpen: vi.fn(),
    quickStartOpen: false,
    setQuickStartOpen: vi.fn(),
    conversations: [],
    activeConversationId: "conv-1",
    handleConversationChange: vi.fn().mockResolvedValue(undefined),
    messages: [],
    handleMessagesUpdate: vi.fn(),
    handleNewConversation: vi.fn().mockResolvedValue(undefined),
    creatingConversation: false,
    handleRenameConversation: vi.fn().mockResolvedValue(undefined),
    handleDeleteConversation: vi.fn().mockResolvedValue(undefined),
    theme: "dark" as const,
    toggleTheme: vi.fn(),
  };
}

describe("PlaygroundPage", () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/auth/status") {
        return {
          json: async () => ({ enabled: true }),
        } as Response;
      }

      if (String(input) === "/api/auth/logout" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ authenticated: false }),
        } as Response;
      }

      throw new Error(`Unhandled fetch: ${String(input)}`);
    }) as typeof fetch;

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "http://localhost/" },
    });
  });

  afterEachPage();

  function afterEachPage() {
    afterEach(() => {
      cleanup();
      global.fetch = originalFetch;
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    });
  }

  it("loads auth status and signs the user out through the header action", async () => {
    usePlaygroundStateMock.mockReturnValue(createState());

    render(<PlaygroundPage />);

    await waitFor(() => {
      expect(screen.getByTestId("header-auth-enabled").textContent).toBe("true");
    });

    fireEvent.click(screen.getByText("Header Sign Out"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    });
    expect(window.location.href).toBe("/login");
  });

  it("wires shell interactions back into the playground state handlers", async () => {
    const state = createState();
    usePlaygroundStateMock.mockReturnValue(state);

    render(<PlaygroundPage />);

    fireEvent.click(screen.getByText("Header Connect"));
    fireEvent.click(screen.getByText("Header Settings"));
    fireEvent.click(screen.getByText("Header Theme"));
    fireEvent.click(screen.getByText("Select Orders"));
    fireEvent.click(screen.getByText("Switch Conversation"));
    fireEvent.click(screen.getByText("New Conversation"));

    await waitFor(() => {
      expect(state.handleConversationChange).toHaveBeenCalledWith("conv-2");
    });

    expect(state.setConnectDialogOpen).toHaveBeenCalledWith(true);
    expect(state.setQuickStartOpen).toHaveBeenCalledWith(true);
    expect(state.toggleTheme).toHaveBeenCalled();
    expect(state.handleSelectCollection).toHaveBeenCalledWith("orders");
    expect(state.setViewMode).toHaveBeenNthCalledWith(1, "ingest");
    expect(state.setViewMode).toHaveBeenNthCalledWith(2, "chat");
    expect(state.handleNewConversation).toHaveBeenCalled();
  });

  it("disconnects immediately from the header when already connected", () => {
    const state = createState({ isConnected: true });
    usePlaygroundStateMock.mockReturnValue(state);

    render(<PlaygroundPage />);
    fireEvent.click(screen.getByText("Header Connect"));

    expect(state.handleDisconnect).toHaveBeenCalled();
    expect(state.setConnectDialogOpen).not.toHaveBeenCalled();
  });
});
