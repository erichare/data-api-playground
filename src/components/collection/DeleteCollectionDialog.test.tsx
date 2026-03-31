// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteCollectionDialog } from "./DeleteCollectionDialog";

vi.mock("framer-motion", () => {
  const cleanProps = (props: Record<string, unknown>) => {
    const {
      initial,
      animate,
      exit,
      transition,
      whileHover,
      whileTap,
      layout,
      ...rest
    } = props;

    void initial;
    void animate;
    void exit;
    void transition;
    void whileHover;
    void whileTap;
    void layout;
    return rest;
  };

  return {
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...cleanProps(props)}>{children}</div>
      ),
      button: ({
        children,
        ...props
      }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...cleanProps(props)}>{children}</button>
      ),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

describe("DeleteCollectionDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("requires an exact collection-name match before deleting", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    const { container } = render(
      <DeleteCollectionDialog
        collectionName="orders"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    const input = screen.getByPlaceholderText("orders");
    const deleteButton = screen.getByRole("button", { name: "Delete Collection" });

    expect(deleteButton.hasAttribute("disabled")).toBe(true);
    expect(container.querySelector("code")?.textContent).toBe('db.dropCollection("orders");');

    fireEvent.change(input, { target: { value: "Orders" } });

    expect(screen.getByText(/Name doesn't match/)).toBeTruthy();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "orders" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onConfirm).toHaveBeenCalledWith("orders");
    expect(onClose).toHaveBeenCalled();
  });

  it("resets the confirmation input when the collection changes and swaps SDK snippets", () => {
    const { container, rerender } = render(
      <DeleteCollectionDialog
        collectionName="orders"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText("orders") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "orders" } });
    expect(input.value).toBe("orders");

    fireEvent.click(screen.getByRole("button", { name: "Py" }));
    expect(container.querySelector("code")?.textContent).toBe('db.drop_collection("orders")');

    rerender(
      <DeleteCollectionDialog
        collectionName="invoices"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect((screen.getByPlaceholderText("invoices") as HTMLInputElement).value).toBe("");
    expect(container.querySelector("code")?.textContent).toContain('"invoices"');
  });
});
