// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionItem } from "./CollectionItem";

function makeCollectionProps(
  overrides: Partial<Parameters<typeof CollectionItem>[0]> = {}
) {
  return {
    collection: {
      name: "orders",
      count: 1200,
      documentCount: 45,
      vectorDim: 768,
      vectorizeService: null,
    },
    isActive: false,
    onClick: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe("CollectionItem", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders sampled counts and supports click, keyboard, and delete interactions", () => {
    const props = makeCollectionProps();
    render(<CollectionItem {...props} />);

    expect(screen.getByText("orders")).toBeTruthy();
    expect(screen.getByText("45 docs, 1,200 chunks")).toBeTruthy();

    const interactiveArea = screen.getByRole("button", { name: /orders/i });
    fireEvent.click(interactiveArea);
    fireEvent.keyDown(interactiveArea, { key: "Enter" });

    expect(props.onClick).toHaveBeenCalledTimes(2);

    const container = screen.getByText("orders").closest(".relative");
    if (!container) throw new Error("Expected collection container");

    fireEvent.mouseEnter(container);
    const deleteButton = screen.getByTitle("Delete collection");

    fireEvent.mouseEnter(deleteButton);
    expect((deleteButton as HTMLButtonElement).style.color).toBe("rgb(239, 68, 68)");
    fireEvent.mouseLeave(deleteButton);
    expect((deleteButton as HTMLButtonElement).style.color).toBe("var(--text-muted)");

    fireEvent.click(deleteButton);
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows fallback copy when counts are unavailable", () => {
    render(
      <CollectionItem
        {...makeCollectionProps({
          collection: {
            name: "unknown",
            vectorDim: null,
            vectorizeService: null,
          },
        })}
      />
    );

    expect(screen.getByText("Count not sampled")).toBeTruthy();
  });

  it("renders creating collections as pending and blocks click handling", () => {
    const props = makeCollectionProps({
      collection: {
        name: "reports",
        count: 0,
        documentCount: 0,
        vectorDim: null,
        vectorizeService: null,
        creating: true,
        pendingKey: "reports::pending",
      },
    });
    render(<CollectionItem {...props} />);

    expect(screen.getByText("Creating collection...")).toBeTruthy();
    expect(screen.queryByTitle("Delete collection")).toBeNull();

    const interactiveArea = screen.getByText("reports").closest('[role="button"]');
    if (!interactiveArea) throw new Error("Expected collection button");

    expect(interactiveArea.getAttribute("tabindex")).toBe("-1");

    fireEvent.click(interactiveArea);
    fireEvent.keyDown(interactiveArea, { key: "Enter" });

    expect(props.onClick).not.toHaveBeenCalled();
  });
});
