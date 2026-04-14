// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationItem } from "./ConversationItem";

function makeConversationProps(
  overrides: Partial<Parameters<typeof ConversationItem>[0]> = {}
) {
  return {
    conversation: {
      id: "conv-1",
      name: "First Conversation",
      messages: [],
      createdAt: new Date("2026-03-30T12:00:00.000Z"),
      updatedAt: new Date("2026-03-30T12:00:00.000Z"),
      messageCount: 2,
    },
    isActive: false,
    onClick: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe("ConversationItem", () => {
  afterEach(() => {
    cleanup();
  });

  it("supports click, keyboard navigation, rename, and delete interactions", () => {
    const props = makeConversationProps();
    render(<ConversationItem {...props} />);

    expect(screen.getByText("2 messages")).toBeTruthy();

    const interactiveArea = screen.getByRole("button", {
      name: /First Conversation/i,
    });

    fireEvent.click(interactiveArea);
    fireEvent.keyDown(interactiveArea, { key: "Enter" });
    expect(props.onClick).toHaveBeenCalledTimes(2);

    const container = screen.getByText("First Conversation").closest(".relative");
    if (!container) throw new Error("Expected conversation container");

    fireEvent.mouseEnter(container);
    const renameButton = screen.getByTitle("Rename");
    const deleteButton = screen.getByTitle("Delete");

    fireEvent.mouseEnter(renameButton);
    expect((renameButton as HTMLButtonElement).style.color).toBe("var(--interactive)");
    fireEvent.mouseLeave(renameButton);
    expect((renameButton as HTMLButtonElement).style.color).toBe("var(--text-muted)");

    fireEvent.mouseEnter(deleteButton);
    expect((deleteButton as HTMLButtonElement).style.color).toBe("rgb(239, 68, 68)");
    fireEvent.mouseLeave(deleteButton);
    expect((deleteButton as HTMLButtonElement).style.color).toBe("var(--text-muted)");

    fireEvent.click(renameButton);
    const input = screen.getByDisplayValue("First Conversation");
    fireEvent.change(input, { target: { value: "Renamed Conversation" } });
    const editRow = input.parentElement;
    if (!editRow) throw new Error("Expected edit row");
    const confirmButton = editRow.querySelectorAll("button")[0];
    if (!(confirmButton instanceof HTMLButtonElement)) {
      throw new Error("Expected rename confirm button");
    }
    fireEvent.click(confirmButton);

    expect(props.onRename).toHaveBeenCalledWith("Renamed Conversation");

    fireEvent.mouseEnter(container);
    fireEvent.click(screen.getByTitle("Delete"));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("falls back to message array length and hides the count when empty", () => {
    const { rerender } = render(
      <ConversationItem
        {...makeConversationProps({
          conversation: {
            id: "conv-2",
            name: "Derived Count",
            messages: [{ id: "m1" }, { id: "m2" }, { id: "m3" }] as never[],
            createdAt: new Date("2026-03-30T12:00:00.000Z"),
            updatedAt: new Date("2026-03-30T12:00:00.000Z"),
          },
        })}
      />
    );

    expect(screen.getByText("3 messages")).toBeTruthy();

    rerender(
      <ConversationItem
        {...makeConversationProps({
          conversation: {
            id: "conv-3",
            name: "Empty Conversation",
            messages: [],
            createdAt: new Date("2026-03-30T12:00:00.000Z"),
            updatedAt: new Date("2026-03-30T12:00:00.000Z"),
            messageCount: 0,
          },
        })}
      />
    );

    expect(screen.queryByText(/messages?/)).toBeNull();
  });

  it("resets unchanged and cancelled edits without renaming", () => {
    const props = makeConversationProps();
    render(<ConversationItem {...props} />);

    fireEvent.doubleClick(screen.getByText("First Conversation"));
    let input = screen.getByDisplayValue("First Conversation");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.getByText("First Conversation")).toBeTruthy();

    fireEvent.doubleClick(screen.getByText("First Conversation"));
    input = screen.getByDisplayValue("First Conversation");
    fireEvent.change(input, { target: { value: "Discarded Rename" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.getByText("First Conversation")).toBeTruthy();
  });
});
