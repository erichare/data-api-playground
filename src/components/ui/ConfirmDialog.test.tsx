// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog(
  overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}
) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();

  render(
    <ConfirmDialog
      open={true}
      title="Delete document?"
      description="This cannot be undone."
      onConfirm={onConfirm}
      onClose={onClose}
      {...overrides}
    />
  );

  return { onConfirm, onClose };
}

describe("ConfirmDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing while closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Hidden"
        description="Hidden"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders through a portal and only confirms from the action button", () => {
    const { onConfirm, onClose } = renderDialog();

    const dialog = screen.getByRole("dialog");
    const overlay = dialog.parentElement;
    if (!overlay) throw new Error("Expected dialog overlay");

    expect(document.body.contains(dialog)).toBe(true);

    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes from the overlay or Escape while idle", () => {
    const { onClose } = renderDialog();

    const dialog = screen.getByRole("dialog");
    const overlay = dialog.parentElement;
    if (!overlay) throw new Error("Expected dialog overlay");

    fireEvent.click(overlay);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("locks dismissal while confirming and disables both buttons", () => {
    const { onClose } = renderDialog({ confirming: true });

    const dialog = screen.getByRole("dialog");
    const overlay = dialog.parentElement;
    if (!overlay) throw new Error("Expected dialog overlay");

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const confirmButton = screen.getByRole("button", { name: "Deleting..." });

    expect((cancelButton as HTMLButtonElement).disabled).toBe(true);
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(overlay);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("honors confirmDisabled and renders custom content", () => {
    renderDialog({
      confirmDisabled: true,
      children: <p>Type the name to continue.</p>,
    });

    expect(screen.getByText("Type the name to continue.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
