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

describe("usePlaygroundState", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useConversationStateMock.mockImplementation(() => ({
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
    }));

    usePlaygroundAuthMock.mockImplementation(() => ({
      authEnabled: true,
      handleSignOut: vi.fn(),
    }));

    useThemeStateMock.mockImplementation(() => ({
      theme: "dark",
      toggleTheme: vi.fn(),
    }));

    usePlaygroundConnectionMock.mockImplementation(() => ({
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
      keyspaces: [],
      selectedKeyspace: "default_keyspace",
      handleSelectCollection: vi.fn(),
      handleKeyspaceChange: vi.fn(),
      handleCollectionCreated: vi.fn(),
    }));
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
    const handleConversationChange = vi.fn().mockResolvedValue(undefined);

    useConversationStateMock.mockImplementation(() => ({
      conversations: [],
      activeConversationId: "conv-1",
      creatingConversation: false,
      messages: [],
      bootstrapConversations: vi.fn().mockResolvedValue("conv-1"),
      resetConversationTracking: vi.fn(),
      handleConversationChange,
      handleMessagesUpdate: vi.fn(),
      handleNewConversation: vi.fn(),
      handleRenameConversation: vi.fn(),
      handleDeleteConversation: vi.fn(),
    }));

    usePlaygroundConnectionMock.mockImplementation(() => ({
      astraToken: "",
      astraEndpoint: "",
      astraFromEnv: false,
      envReady: true,
      initializing: false,
      isConnected: false,
      connectDialogOpen: false,
      setConnectDialogOpen,
      connectError: "Connection failed",
      setConnectError,
      handleConnect: vi.fn(),
      handleDisconnect,
      collections: [],
      setCollections: vi.fn(),
      collectionFields: {},
      activeCollection: "",
      activeCollectionObj: undefined,
      keyspaces: [],
      selectedKeyspace: "default_keyspace",
      handleSelectCollection,
      handleKeyspaceChange: vi.fn(),
      handleCollectionCreated: vi.fn(),
    }));

    const { result } = renderHook(() => usePlaygroundState());

    act(() => {
      result.current.headerProps.onConnectionClick?.();
    });
    act(() => {
      result.current.sidebarProps.onSelectCollection("orders");
    });
    await act(async () => {
      await result.current.sidebarProps.onConversationChange("conv-2");
    });
    act(() => {
      result.current.dialogsProps.onCloseConnect();
    });

    expect(setConnectDialogOpen).toHaveBeenCalledWith(true);
    expect(handleSelectCollection).toHaveBeenCalledWith("orders");
    expect(result.current.mainPanelProps.viewMode).toBe("chat");
    expect(handleConversationChange).toHaveBeenCalledWith("conv-2");
    expect(setConnectDialogOpen).toHaveBeenLastCalledWith(false);
    expect(setConnectError).toHaveBeenCalledWith("");
  });
});
