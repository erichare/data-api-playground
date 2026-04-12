// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TypingIndicator } from "./TypingIndicator";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe("TypingIndicator", () => {
  it("renders the assistant avatar and three typing dots", () => {
    const { container } = render(<TypingIndicator />);

    expect(screen.getByText("AI")).toBeTruthy();
    expect(container.querySelectorAll(".typing-dot")).toHaveLength(3);
  });
});
