import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  IBM_Plex_Sans: () => ({ variable: "font-sans-test" }),
  IBM_Plex_Mono: () => ({ variable: "font-mono-test" }),
}));

vi.mock("@vercel/analytics/next", () => ({
  Analytics: () => null,
}));

describe("app/layout", () => {
  it("exports the root metadata and html shell", async () => {
    const { default: RootLayout, metadata } = await import("./layout");

    expect(metadata).toMatchObject({
      title: "Data API Playground",
      description: expect.stringContaining("Interactive playground"),
    });

    const result = RootLayout({
      children: <div>Playground</div>,
    });
    const body = result.props.children;

    expect(result.type).toBe("html");
    expect(result.props.lang).toBe("en");
    expect(result.props.className).toContain("font-sans-test");
    expect(result.props.className).toContain("font-mono-test");
    expect(body.type).toBe("body");
    expect(body.props.className).toContain("bg-[var(--bg-primary)]");
    expect(Array.isArray(body.props.children)).toBe(true);
    expect(body.props.children[0]).toMatchObject({
      type: "div",
      props: { children: "Playground" },
    });
  });
});
