// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaygroundState } from "./usePlaygroundState";

const { useConversationStateMock, usePlaygroundConnectionMock } = vi.hoisted(() => ({
  useConversationStateMock: vi.fn(),
  usePlaygroundConnectionMock: vi.fn(),
}));

vi.mock("@/lib/hooks/useConversationState", () => ({
  useConversationState: useConversationStateMock,
}));

vi.mock("@/lib/hooks/usePlaygroundConnection", () => ({
  usePlaygroundConnection: usePlaygroundConnectionMock,
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
      theme: "dark",
      toggleTheme: vi.fn(),
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

  it("passes the current IBM credentials into useConversationState", async () => {
    const { result } = renderHook(() => usePlaygroundState());

    act(() => {
      result.current.handleIbmApiKeyChange("ibm-key");
      result.current.handleWatsonxProjectIdChange("project-1");
    });

    await waitFor(() => {
      expect(useConversationStateMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          ibmApiKey: "ibm-key",
          watsonxProjectId: "project-1",
        })
      );
    });

    expect(result.current.ibmApiKey).toBe("ibm-key");
    expect(result.current.watsonxProjectId).toBe("project-1");
  });

  it("returns to chat mode when the conversation hook activates a conversation", () => {
    const { result } = renderHook(() => usePlaygroundState());
    const firstCallArgs = useConversationStateMock.mock.calls.at(-1)?.[0] as {
      onConversationActivated?: () => void;
    };

    act(() => {
      result.current.setViewMode("ingest");
    });
    expect(result.current.viewMode).toBe("ingest");

    act(() => {
      firstCallArgs.onConversationActivated?.();
    });

    expect(result.current.viewMode).toBe("chat");
  });

  it("returns to chat mode when the connection hook triggers a disconnect reset", () => {
    const { result } = renderHook(() => usePlaygroundState());
    const firstCallArgs = usePlaygroundConnectionMock.mock.calls.at(-1)?.[0] as {
      onDisconnectViewReset?: () => void;
    };

    act(() => {
      result.current.setViewMode("api");
    });
    expect(result.current.viewMode).toBe("api");

    act(() => {
      firstCallArgs.onDisconnectViewReset?.();
    });

    expect(result.current.viewMode).toBe("chat");
  });
});
