// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
      { name: "dap_internal", count: 3, documentCount: 1, vectorDim: 768, vectorizeService: null },
    ],
    activeCollection: "orders",
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
    viewMode: "chat",
    ...overrides,
  };
}

describe("Sidebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps internal collections hidden in both expanded and collapsed modes", () => {
    const props = makeSidebarProps();
    render(<Sidebar {...props} />);

    expect(screen.queryByText("dap_internal")).toBeNull();
    expect(screen.getByText("orders")).toBeTruthy();
    expect(screen.getByText("3 docs, 12 chunks")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Collapse sidebar"));

    expect(screen.queryByTitle("dap_internal")).toBeNull();

    fireEvent.click(screen.getByTitle("orders"));
    expect(props.onSelectCollection).toHaveBeenCalledWith("orders");
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
