// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

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
      aside: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <aside {...cleanProps(props)}>{children}</aside>
      ),
      button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...cleanProps(props)}>{children}</button>
      ),
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...cleanProps(props)}>{children}</div>
      ),
    },
  };
});

function makeSidebarProps(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return {
    collections: [
      { name: "orders", count: 12, documentCount: 3, vectorDim: 768, vectorizeService: null },
    ],
    activeCollection: "orders",
    collectionCreateError: "",
    onSelectCollection: vi.fn(),
    onNewCollection: vi.fn(),
    conversations: [
      {
        id: "conv-1",
        name: "First Conversation",
        messages: [],
        createdAt: new Date("2026-03-30T12:00:00.000Z"),
        updatedAt: new Date("2026-03-30T12:00:00.000Z"),
        messageCount: 1,
      },
    ],
    activeConversationId: "conv-1",
    onConversationChange: vi.fn(),
    onNewConversation: vi.fn(),
    creatingConversation: false,
    onRenameConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onDeleteCollection: vi.fn().mockResolvedValue(undefined),
    viewMode: "chat",
    ...overrides,
  };
}

describe("Sidebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows all collections in both expanded and collapsed modes", () => {
    const props = makeSidebarProps();
    render(<Sidebar {...props} />);

    expect(screen.getByText("orders")).toBeTruthy();
    expect(screen.getByText("3 docs, 12 chunks")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Collapse sidebar"));

    fireEvent.click(screen.getByTitle("orders"));
    expect(props.onSelectCollection).toHaveBeenCalledWith("orders");
  });

  it("shows a creating collection as pending and surfaces collection-create errors", () => {
    const props = makeSidebarProps({
      collections: [
        {
          name: "orders",
          count: 12,
          documentCount: 3,
          vectorDim: 768,
          vectorizeService: null,
        },
        {
          name: "reports",
          count: 0,
          documentCount: 0,
          vectorDim: null,
          vectorizeService: { provider: "nvidia", modelName: "NV-Embed-QA" },
          creating: true,
          pendingKey: "reports::pending",
        },
      ],
      collectionCreateError: 'Failed to create "broken"',
    });
    render(<Sidebar {...props} />);

    expect(screen.getByText("Creating collection...")).toBeTruthy();
    expect(screen.getByText('Failed to create "broken"')).toBeTruthy();

    fireEvent.click(screen.getByText("reports"));
    expect(props.onSelectCollection).not.toHaveBeenCalledWith("reports");

    expect(screen.getAllByTitle("Delete collection")).toHaveLength(1);
  });

  it("requires typing the collection name before deleting it", async () => {
    const props = makeSidebarProps();
    render(<Sidebar {...props} />);

    fireEvent.click(screen.getByTitle("Delete collection"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete collection?")).toBeTruthy();
    expect(
      within(dialog).getByText(/This action is destructive and cannot be undone/i)
    ).toBeTruthy();

    const confirmButton = within(dialog).getByRole("button", {
      name: "Delete collection",
    });
    expect(confirmButton.hasAttribute("disabled")).toBe(true);

    fireEvent.change(within(dialog).getByPlaceholderText("orders"), {
      target: { value: "orders" },
    });
    expect(confirmButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(confirmButton);

    await Promise.resolve();
    expect(props.onDeleteCollection).toHaveBeenCalledWith("orders");
  });

  it("shows collection deletion errors and clears them when the dialog is closed", async () => {
    const props = makeSidebarProps({
      onDeleteCollection: vi.fn().mockRejectedValue(new Error("Delete failed")),
    });
    render(<Sidebar {...props} />);

    fireEvent.click(screen.getByTitle("Delete collection"));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("orders"), {
      target: { value: "orders" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Delete collection",
      })
    );

    expect(await screen.findByText("Delete failed")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("supports renaming and deleting conversations", () => {
    const props = makeSidebarProps();
    render(<Sidebar {...props} />);

    fireEvent.doubleClick(screen.getByText("First Conversation"));
    const input = screen.getByDisplayValue("First Conversation");
    fireEvent.change(input, { target: { value: "Renamed Conversation" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onRenameConversation).toHaveBeenCalledWith(
      "conv-1",
      "Renamed Conversation"
    );

    fireEvent.click(screen.getByTitle("Delete"));
    expect(screen.getByText("Delete conversation?")).toBeTruthy();
    expect(props.onDeleteConversation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete conversation" }));
    expect(props.onDeleteConversation).toHaveBeenCalledWith("conv-1");
  });

  it("cancels rename edits and supports keyboard navigation", () => {
    const props = makeSidebarProps({
      conversations: [
        {
          id: "conv-1",
          name: "First Conversation",
          messages: [],
          createdAt: new Date("2026-03-30T12:00:00.000Z"),
          updatedAt: new Date("2026-03-30T12:00:00.000Z"),
          messageCount: 2,
        },
      ],
      viewMode: "ingest",
    });
    render(<Sidebar {...props} />);

    fireEvent.keyDown(screen.getByRole("button", { name: /First Conversation/i }), {
      key: "Enter",
    });
    expect(props.onConversationChange).toHaveBeenCalledWith("conv-1");

    fireEvent.keyDown(screen.getByRole("button", { name: /orders/i }), {
      key: "Enter",
    });
    expect(props.onSelectCollection).toHaveBeenCalledWith("orders");

    fireEvent.doubleClick(screen.getByText("First Conversation"));
    const input = screen.getByDisplayValue("First Conversation");
    fireEvent.change(input, { target: { value: "Discarded Rename" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(props.onRenameConversation).not.toHaveBeenCalledWith(
      "conv-1",
      "Discarded Rename"
    );
    expect(screen.getByText("2 messages")).toBeTruthy();
  });

  it("creates and switches conversations from the collapsed sidebar", () => {
    const props = makeSidebarProps({
      conversations: [
        {
          id: "conv-1",
          name: "First Conversation",
          messages: [],
          createdAt: new Date("2026-03-30T12:00:00.000Z"),
          updatedAt: new Date("2026-03-30T12:00:00.000Z"),
          messageCount: 1,
        },
        {
          id: "conv-2",
          name: "Second Conversation",
          messages: [],
          createdAt: new Date("2026-03-31T12:00:00.000Z"),
          updatedAt: new Date("2026-03-31T12:00:00.000Z"),
          messageCount: 0,
        },
      ],
    });
    render(<Sidebar {...props} />);

    fireEvent.click(screen.getByTestId("new-conversation-button"));
    expect(props.onNewConversation).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("Collapse sidebar"));
    fireEvent.click(screen.getByTitle("Second Conversation"));
    expect(props.onConversationChange).toHaveBeenCalledWith("conv-2");
  });

  it("disables the new-conversation button while a conversation is being created", () => {
    render(<Sidebar {...makeSidebarProps({ creatingConversation: true })} />);

    expect(screen.getByTestId("new-conversation-button").hasAttribute("disabled")).toBe(true);
  });
});
