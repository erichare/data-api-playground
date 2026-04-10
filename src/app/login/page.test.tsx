import { describe, expect, it, beforeEach, vi } from "vitest";

const {
  cookiesMock,
  redirectMock,
  loginFormMock,
  isAuthEnabledMock,
  isAuthenticatedCookieValueMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  loginFormMock: vi.fn(() => null),
  isAuthEnabledMock: vi.fn(),
  isAuthenticatedCookieValueMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: loginFormMock,
}));

vi.mock("@/lib/auth", () => ({
  AUTH_COOKIE_NAME: "dap_auth",
  isAuthEnabled: isAuthEnabledMock,
  isAuthenticatedCookieValue: isAuthenticatedCookieValueMock,
}));

describe("app/login/page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    isAuthEnabledMock.mockReturnValue(true);
    isAuthenticatedCookieValueMock.mockReturnValue(false);
  });

  it("redirects home when password auth is disabled", async () => {
    isAuthEnabledMock.mockReturnValue(false);
    const { default: LoginPage } = await import("./page");

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: "/collections" }),
      })
    ).rejects.toThrow("redirect:/");
  });

  it("redirects home when the auth cookie is already valid", async () => {
    const getMock = vi.fn(() => ({ value: "valid-session" }));
    cookiesMock.mockResolvedValue({ get: getMock });
    isAuthenticatedCookieValueMock.mockReturnValue(true);
    const { default: LoginPage } = await import("./page");

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: "/collections" }),
      })
    ).rejects.toThrow("redirect:/");

    expect(getMock).toHaveBeenCalledWith("dap_auth");
    expect(isAuthenticatedCookieValueMock).toHaveBeenCalledWith("valid-session");
  });

  it("passes through a safe next path to the login form", async () => {
    const { default: LoginPage } = await import("./page");

    const result = await LoginPage({
      searchParams: Promise.resolve({ next: "/collections/docs" }),
    });

    expect(result).toMatchObject({
      props: {
        nextPath: "/collections/docs",
      },
    });
  });

  it("falls back to the root path when the next param is not an internal route", async () => {
    const { default: LoginPage } = await import("./page");

    const result = await LoginPage({
      searchParams: Promise.resolve({ next: "https://example.com/phish" }),
    });

    expect(result).toMatchObject({
      props: {
        nextPath: "/",
      },
    });
  });
});
