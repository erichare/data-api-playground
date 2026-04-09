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
    currentHuggingfaceApiKey: "",
    onHuggingfaceApiKeyChange: vi.fn(),
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
      if (String(input) === "/api/ai-status") {
        return new Response(
          JSON.stringify({
            hasHuggingFaceEnvKey: true,
            ollamaReachable: true,
            ollamaBaseUrl: "http://127.0.0.1:11434",
            chatModelInstalled: true,
            embedModelInstalled: true,
            chatModel: "granite3.1-dense:8b",
            embedModel: "granite-embedding:278m",
          })
        );
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

    expect(screen.getByText("Hugging Face via env")).toBeTruthy();
    expect(screen.getAllByText("Set via environment").length).toBe(3);

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

  it("trims the manual Hugging Face key on blur and connect", async () => {
    const props = makeProps();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai-status") {
        return new Response(
          JSON.stringify({
            hasHuggingFaceEnvKey: false,
            ollamaReachable: false,
            ollamaBaseUrl: "http://127.0.0.1:11434",
            chatModelInstalled: false,
            embedModelInstalled: false,
            chatModel: "granite3.1-dense:8b",
            embedModel: "granite-embedding:278m",
          })
        );
      }

      if (String(input) === "/api/astra-status") {
        return new Response(JSON.stringify({ hasToken: false, hasEndpoint: false }));
      }

      throw new Error(`Unhandled fetch: ${String(input)}`);
    }) as typeof fetch;

    render(<AstraConnectDialog {...props} />);

    await waitFor(() => {
      expect(screen.getByText("Ollama local fallback")).toBeTruthy();
    });

    const huggingfaceInput = screen.getByTestId("huggingface-api-key-input");
    const tokenInput = screen.getByTestId("astra-token-input");
    const endpointInput = screen.getByTestId("astra-endpoint-input");
    const connectButton = screen.getByTestId("astra-connect-submit");

    expect(connectButton.hasAttribute("disabled")).toBe(true);

    fireEvent.change(huggingfaceInput, { target: { value: "  hf-key  " } });
    fireEvent.blur(huggingfaceInput);
    expect(props.onHuggingfaceApiKeyChange).toHaveBeenCalledWith("hf-key");

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
    expect(props.onHuggingfaceApiKeyChange).toHaveBeenLastCalledWith("hf-key");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("shows the masked active token and disconnects immediately when already connected", async () => {
    const props = makeProps({
      connected: true,
      currentToken: "AstraCS:abcdefghijklmnop",
      currentEndpoint: "https://db.apps.astra.datastax.com",
    });
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai-status") {
        return new Response(
          JSON.stringify({
            hasHuggingFaceEnvKey: true,
            ollamaReachable: true,
            ollamaBaseUrl: "http://127.0.0.1:11434",
            chatModelInstalled: true,
            embedModelInstalled: true,
            chatModel: "granite3.1-dense:8b",
            embedModel: "granite-embedding:278m",
          })
        );
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

  it("shows missing Ollama models and lets users toggle secret visibility", async () => {
    const props = makeProps();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai-status") {
        return new Response(
          JSON.stringify({
            hasHuggingFaceEnvKey: false,
            ollamaReachable: true,
            ollamaBaseUrl: "http://127.0.0.1:11434",
            chatModelInstalled: false,
            embedModelInstalled: false,
            chatModel: "granite3.1-dense:8b",
            embedModel: "granite-embedding:278m",
          })
        );
      }

      if (String(input) === "/api/astra-status") {
        return new Response(JSON.stringify({ hasToken: false, hasEndpoint: false }));
      }

      throw new Error(`Unhandled fetch: ${String(input)}`);
    }) as typeof fetch;

    const { container } = render(<AstraConnectDialog {...props} />);

    await waitFor(() => {
      expect(screen.getByText(/Missing local models:/)).toBeTruthy();
    });
    expect(screen.getByText("Optional")).toBeTruthy();

    const tokenInput = screen.getByTestId("astra-token-input") as HTMLInputElement;
    const huggingfaceInput = screen.getByTestId(
      "huggingface-api-key-input"
    ) as HTMLInputElement;
    const toggleButtons = container.querySelectorAll(
      '[data-testid="astra-token-input"] + button, [data-testid="huggingface-api-key-input"] + button'
    );

    expect(tokenInput.type).toBe("password");
    expect(huggingfaceInput.type).toBe("password");

    fireEvent.click(toggleButtons[0] as HTMLButtonElement);
    fireEvent.click(toggleButtons[1] as HTMLButtonElement);

    expect(tokenInput.type).toBe("text");
    expect(huggingfaceInput.type).toBe("text");
  });

  it("submits on Enter when env-backed Astra credentials are available and shows errors", async () => {
    const props = makeProps({ error: "Connection failed" });
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai-status") {
        return new Response(
          JSON.stringify({
            hasHuggingFaceEnvKey: false,
            ollamaReachable: false,
            ollamaBaseUrl: "http://127.0.0.1:11434",
            chatModelInstalled: false,
            embedModelInstalled: false,
            chatModel: "granite3.1-dense:8b",
            embedModel: "granite-embedding:278m",
          })
        );
      }

      if (String(input) === "/api/astra-status") {
        return new Response(JSON.stringify({ hasToken: true, hasEndpoint: true }));
      }

      throw new Error(`Unhandled fetch: ${String(input)}`);
    }) as typeof fetch;

    render(<AstraConnectDialog {...props} />);

    await waitFor(() => {
      expect(screen.getByText("Connection failed")).toBeTruthy();
    });

    fireEvent.keyDown(screen.getByTestId("astra-token-input"), { key: "Enter" });

    await waitFor(() => {
      expect(props.onConnect).toHaveBeenCalledWith("", "");
    });
  });
});
