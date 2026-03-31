// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AstraConnectDialog } from "./AstraConnectDialog";

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
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...cleanProps(props)}>{children}</div>
      ),
      button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...cleanProps(props)}>{children}</button>
      ),
      span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
        <span {...cleanProps(props)}>{children}</span>
      ),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

function makeProps(overrides: Partial<Parameters<typeof AstraConnectDialog>[0]> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    onConnect: vi.fn(async () => undefined),
    onDisconnect: vi.fn(),
    connected: false,
    currentToken: "",
    currentEndpoint: "",
    currentIbmApiKey: "",
    currentWatsonxProjectId: "",
    onIbmApiKeyChange: vi.fn(),
    onWatsonxProjectIdChange: vi.fn(),
    error: undefined,
    ...overrides,
  };
}

describe("AstraConnectDialog", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it("loads environment status on open and allows env-backed connections", async () => {
    const props = makeProps();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/watsonx-status") {
        return new Response(JSON.stringify({ hasKey: true, hasProjectId: true }));
      }

      if (String(input) === "/api/astra-status") {
        return new Response(JSON.stringify({ hasToken: true, hasEndpoint: true }));
      }

      throw new Error(`Unhandled fetch: ${String(input)}`);
    }) as typeof fetch;

    render(<AstraConnectDialog {...props} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    expect(screen.getAllByText("Set via environment").length).toBe(4);

    const connectButton = screen.getByTestId("astra-connect-submit");
    await waitFor(() => {
      expect(connectButton.hasAttribute("disabled")).toBe(false);
    });

    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(props.onConnect).toHaveBeenCalledWith("", "");
    });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("trims manual credentials and propagates watsonx field changes on blur and connect", async () => {
    const props = makeProps();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/watsonx-status") {
        return new Response(JSON.stringify({ hasKey: false, hasProjectId: false }));
      }

      if (String(input) === "/api/astra-status") {
        return new Response(JSON.stringify({ hasToken: false, hasEndpoint: false }));
      }

      throw new Error(`Unhandled fetch: ${String(input)}`);
    }) as typeof fetch;

    render(<AstraConnectDialog {...props} />);

    await waitFor(() => {
      expect(screen.getAllByText("Not set in environment").length).toBe(2);
    });

    const ibmApiKeyInput = screen.getByPlaceholderText("••••••••••••••••");
    const watsonxProjectInput = screen.getByPlaceholderText("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
    const tokenInput = screen.getByTestId("astra-token-input");
    const endpointInput = screen.getByTestId("astra-endpoint-input");
    const connectButton = screen.getByTestId("astra-connect-submit");

    expect(connectButton.hasAttribute("disabled")).toBe(true);

    fireEvent.change(ibmApiKeyInput, { target: { value: "  ibm-key  " } });
    fireEvent.blur(ibmApiKeyInput);
    expect(props.onIbmApiKeyChange).toHaveBeenCalledWith("ibm-key");

    fireEvent.change(watsonxProjectInput, { target: { value: "  project-1  " } });
    fireEvent.blur(watsonxProjectInput);
    expect(props.onWatsonxProjectIdChange).toHaveBeenCalledWith("project-1");

    fireEvent.change(tokenInput, { target: { value: "  AstraCS:manual-token  " } });
    fireEvent.change(endpointInput, { target: { value: "  https://db.apps.astra.datastax.com  " } });

    expect(connectButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(props.onConnect).toHaveBeenCalledWith(
        "AstraCS:manual-token",
        "https://db.apps.astra.datastax.com"
      );
    });
    expect(props.onIbmApiKeyChange).toHaveBeenLastCalledWith("ibm-key");
    expect(props.onWatsonxProjectIdChange).toHaveBeenLastCalledWith("project-1");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("shows the masked active token and disconnects immediately when already connected", async () => {
    const props = makeProps({
      connected: true,
      currentToken: "AstraCS:abcdefghijklmnop",
      currentEndpoint: "https://db.apps.astra.datastax.com",
    });
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/watsonx-status") {
        return new Response(JSON.stringify({ hasKey: true, hasProjectId: true }));
      }

      if (String(input) === "/api/astra-status") {
        return new Response(JSON.stringify({ hasToken: true, hasEndpoint: true }));
      }

      throw new Error(`Unhandled fetch: ${String(input)}`);
    }) as typeof fetch;

    render(<AstraConnectDialog {...props} />);

    expect(screen.getByText(/AstraCS:••••••••••••••••mnop/)).toBeTruthy();

    fireEvent.click(screen.getByText("Disconnect"));

    expect(props.onDisconnect).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});
