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
    headerProps: {
      connected: false,
      envReady: false,
      authEnabled: true,
      onSignOut: vi.fn(),
      onConnectionClick: vi.fn(),
      onSettingsClick: vi.fn(),
      theme: "dark" as const,
      onToggleTheme: vi.fn(),
    },
    sidebarProps: {
      collections: [],
      activeCollection: "",
      viewMode: "chat",
      onSelectCollection: vi.fn(),
      onNewCollection: vi.fn(),
      keyspaces: [],
      selectedKeyspace: "default_keyspace",
      onKeyspaceChange: vi.fn(),
      conversations: [],
      activeConversationId: "conv-1",
      onConversationChange: vi.fn().mockResolvedValue(undefined),
      onNewConversation: vi.fn().mockResolvedValue(undefined),
      creatingConversation: false,
      onRenameConversation: vi.fn().mockResolvedValue(undefined),
      onDeleteConversation: vi.fn().mockResolvedValue(undefined),
    },
    mainPanelProps: {
      viewMode: "chat",
      onViewModeChange: vi.fn(),
      activeCollection: "",
      activeCollectionObj: undefined,
      collections: [],
      collectionFields: {},
      conversations: [],
      activeConversationId: "conv-1",
      messages: [],
      onMessagesUpdate: vi.fn(),
      astraToken: "",
      astraEndpoint: "",
      keyspace: "default_keyspace",
      huggingfaceApiKey: "",
      initializing: false,
      isConnected: false,
    },
    dialogsProps: {
      newCollectionOpen: false,
      onCloseNewCollection: vi.fn(),
      onCollectionCreated: vi.fn(),
      astraToken: "",
      astraEndpoint: "",
      selectedKeyspace: "default_keyspace",
      quickStartOpen: false,
      onCloseQuickStart: vi.fn(),
      connectDialogOpen: false,
      onCloseConnect: vi.fn(),
      onConnect: vi.fn(),
      onDisconnect: vi.fn(),
      astraFromEnv: false,
      huggingfaceApiKey: "",
      onHuggingfaceApiKeyChange: vi.fn(),
      connectError: "",
      isConnected: false,
    },
  };
}

describe("PlaygroundPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEachPage();

  function afterEachPage() {
    afterEach(() => {
      cleanup();
    });
  }

  it("passes the header shell state through to the header component", async () => {
    usePlaygroundStateMock.mockReturnValue(
      createState({
        headerProps: {
          ...makeBaseState().headerProps,
          authEnabled: true,
        },
      })
    );

    render(<PlaygroundPage />);

    expect(screen.getByTestId("header-auth-enabled").textContent).toBe("true");
  });

  it("renders the grouped shell props into the child components", () => {
    const state = createState();
    usePlaygroundStateMock.mockReturnValue(state);

    render(<PlaygroundPage />);

    fireEvent.click(screen.getByText("Header Connect"));
    fireEvent.click(screen.getByText("Header Settings"));
    fireEvent.click(screen.getByText("Header Theme"));

    expect(state.headerProps.onConnectionClick).toHaveBeenCalled();
    expect(state.headerProps.onSettingsClick).toHaveBeenCalled();
    expect(state.headerProps.onToggleTheme).toHaveBeenCalled();
    expect(screen.getByTestId("main-panel-mode").textContent).toBe("chat");
    expect(screen.getByTestId("connect-dialog-open").textContent).toBe("false");
    expect(screen.getByTestId("quickstart-open").textContent).toBe("false");
  });

  it("passes grouped sidebar interactions through to the sidebar component", async () => {
    const state = createState();
    usePlaygroundStateMock.mockReturnValue(state);

    render(<PlaygroundPage />);

    fireEvent.click(screen.getByText("Select Orders"));
    fireEvent.click(screen.getByText("Switch Conversation"));
    fireEvent.click(screen.getByText("New Conversation"));

    await waitFor(() => {
      expect(state.sidebarProps.onConversationChange).toHaveBeenCalledWith("conv-2");
    });

    expect(state.sidebarProps.onSelectCollection).toHaveBeenCalledWith("orders");
    expect(state.sidebarProps.onNewConversation).toHaveBeenCalled();
  });
});
