// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaygroundState } from "./usePlaygroundState";

const {
  useConversationStateMock,
  usePlaygroundConnectionMock,
  usePlaygroundAuthMock,
  useThemeStateMock,
} = vi.hoisted(() => ({
  useConversationStateMock: vi.fn(),
  usePlaygroundConnectionMock: vi.fn(),
  usePlaygroundAuthMock: vi.fn(),
  useThemeStateMock: vi.fn(),
}));

vi.mock("@/lib/hooks/useConversationState", () => ({
  useConversationState: useConversationStateMock,
}));

vi.mock("@/lib/hooks/usePlaygroundAuth", () => ({
  usePlaygroundAuth: usePlaygroundAuthMock,
}));

vi.mock("@/lib/hooks/usePlaygroundConnection", () => ({
  usePlaygroundConnection: usePlaygroundConnectionMock,
}));

vi.mock("@/lib/hooks/useThemeState", () => ({
  useThemeState: useThemeStateMock,
}));

function createConversationState(overrides: Record<string, unknown> = {}) {
  return {
    conversations: [],
    activeConversationId: "conv-1",
    creatingConversation: false,
    messages: [],
    bootstrapConversations: vi.fn().mockResolvedValue("conv-1"),
    resetConversationTracking: vi.fn(),
    handleConversationChange: vi.fn(),
    handleMessagesUpdate: vi.fn(),
    handleNewConversation: vi.fn(),
    handleRenameConversation: vi.fn(),
    handleDeleteConversation: vi.fn(),
    ...overrides,
  };
}

function createConnectionState(overrides: Record<string, unknown> = {}) {
  return {
    astraToken: "",
    astraEndpoint: "",
    astraFromEnv: false,
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
    setCollections: vi.fn(),
    collectionFields: {},
    activeCollection: "",
    activeCollectionObj: undefined,
    collectionCreateError: "",
    keyspaces: [],
    selectedKeyspace: "default_keyspace",
    handleSelectCollection: vi.fn(),
    handleKeyspaceChange: vi.fn(),
    handleCollectionCreateStarted: vi.fn(),
    handleCollectionCreated: vi.fn(),
    handleCollectionCreateFailed: vi.fn(),
    clearCollectionCreateError: vi.fn(),
    handleCollectionStatsDelta: vi.fn(),
    handleDeleteCollection: vi.fn(),
    ...overrides,
  };
}

describe("usePlaygroundState", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useConversationStateMock.mockImplementation(() => createConversationState());

    usePlaygroundAuthMock.mockImplementation(() => ({
      authEnabled: true,
      handleSignOut: vi.fn(),
    }));

    useThemeStateMock.mockImplementation(() => ({
      theme: "dark",
      toggleTheme: vi.fn(),
    }));

    usePlaygroundConnectionMock.mockImplementation(() => createConnectionState());
  });

  it("passes the current Hugging Face key into useConversationState", async () => {
    const { result } = renderHook(() => usePlaygroundState());

    act(() => {
      result.current.dialogsProps.onHuggingfaceApiKeyChange("hf-key");
    });

    await waitFor(() => {
      expect(useConversationStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          huggingfaceApiKey: "hf-key",
        })
      );
    });
  });

  it("returns to chat mode when the conversation hook activates a conversation", () => {
    const { result } = renderHook(() => usePlaygroundState());
    const firstCallArgs = useConversationStateMock.mock.calls.at(-1)?.[0] as {
      onConversationActivated?: () => void;
    };

    act(() => {
      result.current.mainPanelProps.onViewModeChange("ingest");
    });
    expect(result.current.mainPanelProps.viewMode).toBe("ingest");

    act(() => {
      firstCallArgs.onConversationActivated?.();
    });

    expect(result.current.mainPanelProps.viewMode).toBe("chat");
  });

  it("returns to chat mode when the connection hook triggers a disconnect reset", () => {
    const { result } = renderHook(() => usePlaygroundState());
    const firstCallArgs = usePlaygroundConnectionMock.mock.calls.at(-1)?.[0] as {
      onDisconnectViewReset?: () => void;
    };

    act(() => {
      result.current.mainPanelProps.onViewModeChange("api");
    });
    expect(result.current.mainPanelProps.viewMode).toBe("api");

    act(() => {
      firstCallArgs.onDisconnectViewReset?.();
    });

    expect(result.current.mainPanelProps.viewMode).toBe("chat");
  });

  it("builds shell-ready callbacks around the lower-level hooks", async () => {
    const handleDisconnect = vi.fn();
    const setConnectDialogOpen = vi.fn();
    const setConnectError = vi.fn();
    const handleSelectCollection = vi.fn();
    const clearCollectionCreateError = vi.fn();
    const handleConversationChange = vi.fn().mockResolvedValue(undefined);
    const handleCollectionStatsDelta = vi.fn();

    useConversationStateMock.mockImplementation(() =>
      createConversationState({
        handleConversationChange,
      })
    );

    usePlaygroundConnectionMock.mockImplementation(() =>
      createConnectionState({
        envReady: true,
        setConnectDialogOpen,
        connectError: "Connection failed",
        setConnectError,
        handleDisconnect,
        handleSelectCollection,
        clearCollectionCreateError,
        handleCollectionStatsDelta,
      })
    );

    const { result } = renderHook(() => usePlaygroundState());

    act(() => {
      result.current.headerProps.onConnectionClick?.();
    });
    act(() => {
      result.current.sidebarProps.onSelectCollection("orders");
    });
    act(() => {
      result.current.sidebarProps.onNewCollection();
    });
    await act(async () => {
      await result.current.sidebarProps.onConversationChange("conv-2");
    });
    act(() => {
      result.current.dialogsProps.onCloseConnect();
    });

    expect(setConnectDialogOpen).toHaveBeenCalledWith(true);
    expect(handleSelectCollection).toHaveBeenCalledWith("orders");
    expect(clearCollectionCreateError).toHaveBeenCalled();
    expect(result.current.mainPanelProps.viewMode).toBe("chat");
    expect(result.current.mainPanelProps.onCollectionStatsDelta).toBe(
      handleCollectionStatsDelta
    );
    expect(handleConversationChange).toHaveBeenCalledWith("conv-2");
    expect(setConnectDialogOpen).toHaveBeenLastCalledWith(false);
    expect(setConnectError).toHaveBeenCalledWith("");
  });

  it("disconnects directly from the header when already connected", () => {
    const handleDisconnect = vi.fn();
    const setConnectDialogOpen = vi.fn();

    usePlaygroundConnectionMock.mockImplementation(() =>
      createConnectionState({
        envReady: true,
        isConnected: true,
        handleDisconnect,
        setConnectDialogOpen,
      })
    );

    const { result } = renderHook(() => usePlaygroundState());

    act(() => {
      result.current.headerProps.onConnectionClick?.();
    });

    expect(handleDisconnect).toHaveBeenCalledTimes(1);
    expect(setConnectDialogOpen).not.toHaveBeenCalled();
    expect(result.current.headerProps.envReady).toBe(false);
  });

  it("treats OpenRAG as connected for the shell and clears it on disconnect", () => {
    const handleDisconnect = vi.fn();

    usePlaygroundConnectionMock.mockImplementation(() =>
      createConnectionState({
        isConnected: false,
        handleDisconnect,
      })
    );

    const { result } = renderHook(() => usePlaygroundState());

    act(() => {
      result.current.dialogsProps.onKnowledgeBackendModeChange("openrag");
      result.current.dialogsProps.onOpenragConnectionChange({
        kind: "openrag",
        apiKey: "orag_manual",
        baseUrl: "https://openrag.example.com",
        fromEnv: false,
      });
    });

    expect(result.current.connectionValue.isConnected).toBe(true);
    expect(result.current.headerProps.connected).toBe(true);
    expect(result.current.mainPanelProps.showApiExplorer).toBe(false);
    expect(result.current.sidebarProps.showCollections).toBe(false);
    expect(result.current.dialogsProps.backendConnected).toBe(true);
    expect(result.current.dialogsProps.isConnected).toBe(false);

    act(() => {
      result.current.headerProps.onConnectionClick?.();
    });

    expect(handleDisconnect).toHaveBeenCalledTimes(1);
    expect(result.current.connectionValue.knowledgeBackendMode).toBe("connected");
    expect(result.current.connectionValue.openragConnection).toBeNull();
  });

  it("tracks dialog toggles and resolves the first non-creating collection", () => {
    const clearCollectionCreateError = vi.fn();

    usePlaygroundConnectionMock.mockImplementation(() =>
      createConnectionState({
        activeCollection: "missing",
        collections: [
          { name: "pending", creating: true },
          { name: "orders", creating: false },
          { name: "customers", creating: false },
        ],
        clearCollectionCreateError,
      })
    );

    const { result } = renderHook(() => usePlaygroundState());

    expect(result.current.connectionValue.collections).toEqual([
      expect.objectContaining({ name: "orders" }),
      expect.objectContaining({ name: "customers" }),
    ]);
    expect(result.current.connectionValue.activeCollectionObj).toEqual(
      expect.objectContaining({ name: "orders" })
    );
    expect(result.current.dialogsProps.quickStartOpen).toBe(false);
    expect(result.current.dialogsProps.newCollectionOpen).toBe(false);

    act(() => {
      result.current.headerProps.onSettingsClick();
    });
    expect(result.current.dialogsProps.quickStartOpen).toBe(true);

    act(() => {
      result.current.dialogsProps.onCloseQuickStart();
    });
    expect(result.current.dialogsProps.quickStartOpen).toBe(false);

    act(() => {
      result.current.sidebarProps.onNewCollection();
    });
    expect(clearCollectionCreateError).toHaveBeenCalledTimes(1);
    expect(result.current.dialogsProps.newCollectionOpen).toBe(true);

    act(() => {
      result.current.dialogsProps.onCloseNewCollection();
    });
    expect(result.current.dialogsProps.newCollectionOpen).toBe(false);
  });

  it("forwards sidebar management callbacks to the underlying hooks", () => {
    const handleKeyspaceChange = vi.fn();
    const handleDeleteCollection = vi.fn();
    const handleNewConversation = vi.fn();
    const handleRenameConversation = vi.fn();
    const handleDeleteConversation = vi.fn();

    useConversationStateMock.mockImplementation(() =>
      createConversationState({
        handleNewConversation,
        handleRenameConversation,
        handleDeleteConversation,
      })
    );

    usePlaygroundConnectionMock.mockImplementation(() =>
      createConnectionState({
        handleKeyspaceChange,
        handleDeleteCollection,
      })
    );

    const { result } = renderHook(() => usePlaygroundState());

    act(() => {
      result.current.sidebarProps.onKeyspaceChange("analytics");
      result.current.sidebarProps.onNewConversation();
      result.current.sidebarProps.onRenameConversation("conv-1", "Renamed");
      result.current.sidebarProps.onDeleteConversation("conv-1");
      result.current.sidebarProps.onDeleteCollection("orders");
    });

    expect(handleKeyspaceChange).toHaveBeenCalledWith("analytics");
    expect(handleNewConversation).toHaveBeenCalledTimes(1);
    expect(handleRenameConversation).toHaveBeenCalledWith("conv-1", "Renamed");
    expect(handleDeleteConversation).toHaveBeenCalledWith("conv-1");
    expect(handleDeleteCollection).toHaveBeenCalledWith("orders");
  });
});
