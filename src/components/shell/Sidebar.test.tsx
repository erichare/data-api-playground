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
      { name: "orders", count: 12, vectorDim: 768, vectorizeService: null },
      { name: "dap_internal", count: 3, vectorDim: 768, vectorizeService: null },
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

  it("disables the new-conversation button while a conversation is being created", () => {
    render(<Sidebar {...makeSidebarProps({ creatingConversation: true })} />);

    expect(screen.getByTestId("new-conversation-button").hasAttribute("disabled")).toBe(true);
  });
});
