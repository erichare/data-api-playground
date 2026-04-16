// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BackendConnectionState,
  BackendStatuses,
} from "@/lib/backends/types";
import type { KnowledgeBackendStatuses } from "@/lib/knowledge/types";
import {
  canConnectToBackend,
  ConnectionDialog,
  getActiveAiSummary,
  getBackendSummary,
  getModelFamilyLabel,
  type AiStatus,
} from "./ConnectionDialog";

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
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

const READY_AI_STATUS: AiStatus = {
  hasHuggingFaceEnvKey: false,
  ollamaReachable: true,
  ollamaBaseUrl: "http://127.0.0.1:11434",
  chatModelInstalled: true,
  embedModelInstalled: true,
  huggingfaceChatModel: "Qwen/Qwen2.5-Coder-32B-Instruct",
  huggingfaceEmbedModel: "ibm-granite/granite-embedding-125m-english",
  ollamaChatModel: "granite3.1-dense:8b",
  ollamaEmbedModel: "granite-embedding:278m",
};

const READY_KNOWLEDGE_STATUS: KnowledgeBackendStatuses = {
  openrag: {
    kind: "openrag",
    ready: false,
    hasApiKey: false,
    hasBaseUrl: false,
  },
};

function makeBackendStatuses(
  overrides: Partial<BackendStatuses> = {}
): BackendStatuses {
  return {
    astra: {
      kind: "astra",
      ready: true,
      hasEndpoint: false,
      hasToken: false,
    },
    hcd: {
      kind: "hcd",
      ready: true,
      hasEndpoint: false,
      hasUsername: false,
      hasPassword: false,
    },
    defaultBackend: "astra",
    ...overrides,
  };
}

function mockAiStatus(
  status: Partial<AiStatus> | null,
  knowledgeStatus?: Partial<KnowledgeBackendStatuses["openrag"]>,
  options?: { rejectAi?: boolean; rejectKnowledge?: boolean }
) {
  global.fetch = vi.fn(async (input) => {
    const url = String(input);

    if (url === "/api/ai-status") {
      if (options?.rejectAi) {
        throw new Error("ai status unavailable");
      }

      const payload = { ...READY_AI_STATUS, ...(status ?? {}) };
      return new Response(JSON.stringify(payload));
    }

    if (url === "/api/knowledge-backend-status") {
      if (options?.rejectKnowledge) {
        throw new Error("knowledge status unavailable");
      }

      const payload = {
        openrag: {
          ...READY_KNOWLEDGE_STATUS.openrag,
          ...(knowledgeStatus ?? {}),
        },
      };
      return new Response(JSON.stringify(payload));
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function makeProps(
  overrides: Partial<Parameters<typeof ConnectionDialog>[0]> = {}
) {
  return {
    open: true,
    onClose: vi.fn(),
    onConnect: vi.fn(async () => undefined),
    onDisconnect: vi.fn(),
    connected: false,
    selectedBackend: "astra" as const,
    onSelectedBackendChange: vi.fn(),
    currentConnection: null,
    knowledgeBackendMode: "connected" as const,
    onKnowledgeBackendModeChange: vi.fn(),
    currentOpenragConnection: null,
    onOpenragConnectionChange: vi.fn(),
    backendStatuses: makeBackendStatuses(),
    currentHuggingfaceApiKey: "",
    onHuggingfaceApiKeyChange: vi.fn(),
    error: undefined,
    ...overrides,
  };
}

function renderDialog(
  overrides: Partial<Parameters<typeof ConnectionDialog>[0]> = {}
) {
  const props = makeProps(overrides);
  render(<ConnectionDialog {...props} />);
  return props;
}

function openConnectionTab() {
  fireEvent.click(screen.getByTestId("connection-tab-connection"));
}

function openAiTab() {
  fireEvent.click(screen.getByTestId("connection-tab-ai"));
}

describe("ConnectionDialog helpers", () => {
  it("summarizes Astra, HCD, and env-managed backend connections", () => {
    expect(getBackendSummary(null)).toBe("Managed by server environment");
    expect(
      getBackendSummary({
        backend: "astra",
        token: "AstraCS:abcdefghijklmnop",
        endpoint: "https://db.apps.astra.datastax.com",
      })
    ).toBe("AstraCS:••••••••••••••••mnop");
    expect(
      getBackendSummary({
        backend: "astra",
        token: "",
        endpoint: "",
        fromEnv: true,
      })
    ).toBe("Managed by server environment");
    expect(
      getBackendSummary({
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "cassandra",
        password: "secret",
      })
    ).toBe("cassandra @ https://hcd.example.com:8181");
    expect(
      getBackendSummary({
        backend: "hcd",
        endpoint: "",
        username: "",
        password: "",
        fromEnv: true,
      })
    ).toBe("Managed by server environment");
  });

  it("computes AI backend summaries for manual, env, checking, unreachable, missing-model, and ready states", () => {
    expect(getActiveAiSummary(READY_AI_STATUS, "  hf_manual  ")).toMatchObject({
      label: "Hugging Face via manual key",
      accent: "#22c55e",
    });
    expect(
      getActiveAiSummary({ ...READY_AI_STATUS, hasHuggingFaceEnvKey: true }, "")
    ).toMatchObject({
      label: "Hugging Face via env",
      accent: "#22c55e",
    });
    expect(getActiveAiSummary(null, "")).toMatchObject({
      detail: "Checking local Ollama status...",
    });
    expect(
      getActiveAiSummary({ ...READY_AI_STATUS, ollamaReachable: false }, "")
    ).toMatchObject({
      accent: "#ef4444",
      detail: expect.stringContaining("Ollama is not reachable"),
    });
    expect(
      getActiveAiSummary(
        {
          ...READY_AI_STATUS,
          chatModelInstalled: false,
          embedModelInstalled: false,
        },
        ""
      )
    ).toMatchObject({
      accent: "#f59e0b",
      detail: expect.stringContaining("Missing local models"),
    });
    expect(getActiveAiSummary(READY_AI_STATUS, "")).toMatchObject({
      accent: "#60a5fa",
      detail: expect.stringContaining("Ready locally at"),
    });
  });

  it("derives compact model family labels for the Models tab", () => {
    expect(getModelFamilyLabel("granite3.1-dense:8b")).toBe("granite3.1-dense");
    expect(getModelFamilyLabel("Qwen/Qwen2.5-Coder-32B-Instruct")).toBe(
      "Qwen2.5-Coder"
    );
    expect(getModelFamilyLabel(null)).toBe("Checking...");
  });

  it("computes connect eligibility for Astra and HCD manual and env-backed states", () => {
    expect(
      canConnectToBackend({
        selectedBackend: "astra",
        loading: true,
        currentBackendStatus: makeBackendStatuses().astra,
        knowledgeBackendMode: "connected",
        openragStatus: READY_KNOWLEDGE_STATUS.openrag,
        astraToken: "token",
        astraEndpoint: "endpoint",
        hcdEndpoint: "",
        hcdUsername: "",
        hcdPassword: "",
        openragApiKey: "",
      })
    ).toBe(false);

    expect(
      canConnectToBackend({
        selectedBackend: "astra",
        loading: false,
        currentBackendStatus: makeBackendStatuses().astra,
        knowledgeBackendMode: "connected",
        openragStatus: READY_KNOWLEDGE_STATUS.openrag,
        astraToken: "token",
        astraEndpoint: "endpoint",
        hcdEndpoint: "",
        hcdUsername: "",
        hcdPassword: "",
        openragApiKey: "",
      })
    ).toBe(true);

    expect(
      canConnectToBackend({
        selectedBackend: "astra",
        loading: false,
        currentBackendStatus: {
          ...makeBackendStatuses().astra,
          hasEndpoint: true,
          hasToken: true,
        },
        knowledgeBackendMode: "connected",
        openragStatus: READY_KNOWLEDGE_STATUS.openrag,
        astraToken: "",
        astraEndpoint: "",
        hcdEndpoint: "",
        hcdUsername: "",
        hcdPassword: "",
        openragApiKey: "",
      })
    ).toBe(true);

    expect(
      canConnectToBackend({
        selectedBackend: "hcd",
        loading: false,
        currentBackendStatus: makeBackendStatuses().hcd,
        knowledgeBackendMode: "connected",
        openragStatus: READY_KNOWLEDGE_STATUS.openrag,
        astraToken: "",
        astraEndpoint: "",
        hcdEndpoint: "https://hcd.example.com:8181",
        hcdUsername: "cassandra",
        hcdPassword: "secret",
        openragApiKey: "",
      })
    ).toBe(true);

    expect(
      canConnectToBackend({
        selectedBackend: "hcd",
        loading: false,
        currentBackendStatus: {
          ...makeBackendStatuses().hcd,
          hasEndpoint: true,
          hasUsername: true,
          hasPassword: true,
        },
        knowledgeBackendMode: "connected",
        openragStatus: READY_KNOWLEDGE_STATUS.openrag,
        astraToken: "",
        astraEndpoint: "",
        hcdEndpoint: "",
        hcdUsername: "",
        hcdPassword: "",
        openragApiKey: "",
      })
    ).toBe(true);

    expect(
      canConnectToBackend({
        selectedBackend: "hcd",
        loading: false,
        currentBackendStatus: makeBackendStatuses().hcd,
        knowledgeBackendMode: "connected",
        openragStatus: READY_KNOWLEDGE_STATUS.openrag,
        astraToken: "",
        astraEndpoint: "",
        hcdEndpoint: "",
        hcdUsername: "",
        hcdPassword: "",
        openragApiKey: "",
      })
    ).toBe(false);

    expect(
      canConnectToBackend({
        selectedBackend: "astra",
        loading: false,
        currentBackendStatus: makeBackendStatuses().astra,
        knowledgeBackendMode: "openrag",
        openragStatus: READY_KNOWLEDGE_STATUS.openrag,
        astraToken: "token",
        astraEndpoint: "endpoint",
        hcdEndpoint: "",
        hcdUsername: "",
        hcdPassword: "",
        openragApiKey: "",
      })
    ).toBe(false);

    expect(
      canConnectToBackend({
        selectedBackend: "astra",
        loading: false,
        currentBackendStatus: makeBackendStatuses().astra,
        knowledgeBackendMode: "openrag",
        openragStatus: {
          ...READY_KNOWLEDGE_STATUS.openrag,
          hasApiKey: true,
        },
        astraToken: "token",
        astraEndpoint: "endpoint",
        hcdEndpoint: "",
        hcdUsername: "",
        hcdPassword: "",
        openragApiKey: "",
      })
    ).toBe(true);
  });
});

describe("ConnectionDialog", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it("does not render when closed", () => {
    mockAiStatus(READY_AI_STATUS);
    render(<ConnectionDialog {...makeProps({ open: false })} />);
    expect(screen.queryByTestId("connect-dialog")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("supports env-backed Astra connections and surfaces environment badges", async () => {
    mockAiStatus({ hasHuggingFaceEnvKey: true });
    const props = renderDialog({
      backendStatuses: makeBackendStatuses({
        astra: {
          kind: "astra",
          ready: true,
          hasEndpoint: true,
          hasToken: true,
        },
      }),
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/ai-status");
    });

    expect(screen.getAllByText("Set via environment")).toHaveLength(2);
    openAiTab();
    await waitFor(() => {
      expect(screen.getByText("Hugging Face via env")).toBeTruthy();
    });
    expect(screen.getAllByText("Set via environment")).toHaveLength(1);

    const connectButton = screen.getByTestId("backend-connect-submit");
    expect(connectButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(props.onConnect).toHaveBeenCalledWith({
        backend: "astra",
        token: "",
        endpoint: "",
        fromEnv: true,
      } satisfies BackendConnectionState);
    });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("trims manual Astra and Hugging Face credentials before connecting", async () => {
    mockAiStatus(READY_AI_STATUS);
    const props = renderDialog();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/ai-status");
    });

    const tokenInput = screen.getByTestId("astra-token-input") as HTMLInputElement;
    const endpointInput = screen.getByTestId(
      "astra-endpoint-input"
    ) as HTMLInputElement;

    fireEvent.change(tokenInput, { target: { value: "  AstraCS:manual-token  " } });
    fireEvent.change(endpointInput, {
      target: { value: "  https://db.apps.astra.datastax.com  " },
    });

    openAiTab();

    const huggingfaceInput = screen.getByTestId(
      "huggingface-api-key-input"
    ) as HTMLInputElement;
    fireEvent.change(huggingfaceInput, { target: { value: "  hf_manual_key  " } });
    expect(screen.getByText("Hugging Face via manual key")).toBeTruthy();
    expect(screen.getByTestId("connection-tab-ai").textContent).toContain(
      "Qwen2.5-Coder"
    );
    expect(screen.getByText("Hugging Face · Manual key")).toBeTruthy();
    expect(screen.getByText("Qwen/Qwen2.5-Coder-32B-Instruct")).toBeTruthy();
    expect(screen.getByText("ibm-granite/granite-embedding-125m-english")).toBeTruthy();
    fireEvent.blur(huggingfaceInput);

    fireEvent.click(screen.getByTestId("backend-connect-submit"));

    await waitFor(() => {
      expect(props.onConnect).toHaveBeenCalledWith({
        backend: "astra",
        token: "AstraCS:manual-token",
        endpoint: "https://db.apps.astra.datastax.com",
        fromEnv: false,
      } satisfies BackendConnectionState);
    });
    expect(props.onHuggingfaceApiKeyChange).toHaveBeenLastCalledWith("hf_manual_key");
  });

  it("shows missing local model guidance, toggles secret visibility, and renders inline errors", async () => {
    mockAiStatus({
      chatModelInstalled: false,
      embedModelInstalled: false,
    });

    renderDialog({ error: "Connection failed" });

    expect(screen.getByText("Connection failed")).toBeTruthy();

    const tokenInput = screen.getByTestId("astra-token-input") as HTMLInputElement;
    const tokenToggle = tokenInput.parentElement?.querySelector("button");

    expect(tokenInput.type).toBe("password");
    fireEvent.click(tokenToggle as HTMLButtonElement);
    expect(tokenInput.type).toBe("text");

    openAiTab();

    await waitFor(() => {
      expect(screen.getByText(/Missing local models:/)).toBeTruthy();
    });

    expect(screen.getByText("Optional")).toBeTruthy();

    const huggingfaceInput = screen.getByTestId(
      "huggingface-api-key-input"
    ) as HTMLInputElement;
    const huggingfaceToggle = huggingfaceInput.parentElement?.querySelector("button");

    expect(huggingfaceInput.type).toBe("password");
    fireEvent.click(huggingfaceToggle as HTMLButtonElement);
    expect(huggingfaceInput.type).toBe("text");
  });

  it("renders and connects with HCD environment-backed credentials when AI status is unavailable", async () => {
    mockAiStatus(null, undefined, { rejectAi: true });
    const props = renderDialog({
      selectedBackend: "hcd",
      backendStatuses: makeBackendStatuses({
        hcd: {
          kind: "hcd",
          ready: true,
          hasEndpoint: true,
          hasUsername: true,
          hasPassword: true,
        },
      }),
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/ai-status");
    });

    expect(screen.getByTestId("hcd-username-input")).toBeTruthy();
    expect(screen.getByText("HCD Password")).toBeTruthy();

    openAiTab();
    expect(screen.getByText("Checking local Ollama status...")).toBeTruthy();
    openConnectionTab();

    fireEvent.click(screen.getByTestId("backend-connect-submit"));

    await waitFor(() => {
      expect(props.onConnect).toHaveBeenCalledWith({
        backend: "hcd",
        endpoint: "",
        username: "",
        password: "",
        fromEnv: true,
      } satisfies BackendConnectionState);
    });
  });

  it("shows the active HCD connection summary and disconnects cleanly", async () => {
    mockAiStatus({ ollamaReachable: false });
    const props = renderDialog({
      connected: true,
      selectedBackend: "hcd",
      currentConnection: {
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "cassandra",
        password: "secret",
      },
    });

    openAiTab();
    await waitFor(() => {
      expect(screen.getByText(/Ollama is not reachable at/)).toBeTruthy();
    });

    openConnectionTab();
    expect(screen.getByText("DataStax HCD Connected")).toBeTruthy();
    expect(screen.getByText("cassandra @ https://hcd.example.com:8181")).toBeTruthy();

    fireEvent.click(screen.getByText("Disconnect"));

    expect(props.onDisconnect).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("prefills the Astra form from the current connection and supports reconnecting", async () => {
    mockAiStatus(READY_AI_STATUS);
    const props = renderDialog({
      connected: true,
      currentConnection: {
        backend: "astra",
        token: "AstraCS:abcdefghijklmnop",
        endpoint: "https://db.apps.astra.datastax.com",
      },
      currentHuggingfaceApiKey: "  hf_session_key  ",
    });

    await waitFor(() => {
      expect(
        (screen.getByTestId("astra-token-input") as HTMLInputElement).value
      ).toBe("AstraCS:abcdefghijklmnop");
    });

    expect(screen.getByText(/AstraCS:••••••••••••••••mnop/)).toBeTruthy();
    expect(
      (screen.getByTestId("astra-endpoint-input") as HTMLInputElement).value
    ).toBe("https://db.apps.astra.datastax.com");

    openAiTab();
    expect(
      (screen.getByTestId("huggingface-api-key-input") as HTMLInputElement).value
    ).toBe("  hf_session_key  ");
    expect(screen.getByText("Hugging Face via manual key")).toBeTruthy();

    fireEvent.click(screen.getByTestId("backend-connect-submit"));

    await waitFor(() => {
      expect(props.onConnect).toHaveBeenCalledWith({
        backend: "astra",
        token: "AstraCS:abcdefghijklmnop",
        endpoint: "https://db.apps.astra.datastax.com",
        fromEnv: false,
      } satisfies BackendConnectionState);
    });
  });

  it("wires backend selection, cancel, and failed connect handling", async () => {
    mockAiStatus(READY_AI_STATUS);
    const props = renderDialog({
      onConnect: vi.fn(async () => {
        throw new Error("bad credentials");
      }),
    });

    openAiTab();
    await waitFor(() => {
      expect(screen.getByText(/Ready locally at/)).toBeTruthy();
    });
    openConnectionTab();

    fireEvent.click(screen.getByRole("button", { name: /HCD DataStax HCD/i }));
    expect(props.onSelectedBackendChange).toHaveBeenCalledWith("hcd");

    fireEvent.click(screen.getByText("Cancel"));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId("astra-token-input"), {
      target: { value: "AstraCS:retry-token" },
    });
    fireEvent.change(screen.getByTestId("astra-endpoint-input"), {
      target: { value: "https://retry.apps.astra.datastax.com" },
    });

    fireEvent.click(screen.getByTestId("backend-connect-submit"));

    await waitFor(() => {
      expect(props.onConnect).toHaveBeenCalledTimes(1);
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("backend-connect-submit").textContent).toContain("Connect");
  });

  it("supports OpenRAG knowledge mode while keeping the HCD connection flow consistent", async () => {
    mockAiStatus(READY_AI_STATUS, {
      hasApiKey: true,
      hasBaseUrl: false,
    });
    const props = renderDialog({
      selectedBackend: "hcd",
      backendStatuses: makeBackendStatuses({
        hcd: {
          kind: "hcd",
          ready: false,
          hasEndpoint: false,
          hasUsername: false,
          hasPassword: false,
        },
      }),
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/knowledge-backend-status");
    });

    fireEvent.click(screen.getByRole("button", { name: /HCD DataStax HCD/i }));
    fireEvent.change(screen.getByTestId("hcd-endpoint-input"), {
      target: { value: "https://hcd.example.com:8181" },
    });
    fireEvent.change(screen.getByTestId("hcd-username-input"), {
      target: { value: "  cassandra  " },
    });
    fireEvent.change(screen.getByTestId("hcd-password-input"), {
      target: { value: "secret" },
    });

    fireEvent.click(screen.getByRole("button", { name: /OpenRAG Knowledge service/i }));

    const openragApiKeyInput = screen.getByTestId(
      "openrag-api-key-input"
    ) as HTMLInputElement;
    const openragUrlInput = screen.getByTestId(
      "openrag-base-url-input"
    ) as HTMLInputElement;

    expect(screen.getByText("Defaults to http://localhost:3000")).toBeTruthy();
    expect(screen.getByText("OpenRAG uses semantic search and document ingestion. Hybrid, lexical, and CSV row ingest stay disabled for this backend.")).toBeTruthy();
    expect(openragApiKeyInput.type).toBe("password");

    const openragToggle = openragApiKeyInput.parentElement?.querySelector("button");
    fireEvent.click(openragToggle as HTMLButtonElement);
    expect(openragApiKeyInput.type).toBe("text");

    fireEvent.change(openragApiKeyInput, {
      target: { value: "  orag_manual  " },
    });
    fireEvent.change(openragUrlInput, {
      target: { value: "  https://openrag.example.com/  " },
    });

    fireEvent.click(screen.getByTestId("backend-connect-submit"));

    await waitFor(() => {
      expect(props.onConnect).toHaveBeenCalledWith({
        backend: "hcd",
        endpoint: "https://hcd.example.com:8181",
        username: "cassandra",
        password: "secret",
        fromEnv: false,
      } satisfies BackendConnectionState);
    });
    expect(props.onKnowledgeBackendModeChange).toHaveBeenCalledWith("openrag");
    expect(props.onOpenragConnectionChange).toHaveBeenCalledWith({
      kind: "openrag",
      apiKey: "orag_manual",
      baseUrl: "https://openrag.example.com/",
      fromEnv: false,
    });
  });

  it("keeps OpenRAG settings on the connection tab and model settings on the Models tab", async () => {
    mockAiStatus(READY_AI_STATUS, {
      hasApiKey: true,
      hasBaseUrl: true,
    });

    renderDialog({
      knowledgeBackendMode: "openrag",
      currentOpenragConnection: {
        kind: "openrag",
        apiKey: "",
        baseUrl: "https://openrag.example.com",
        fromEnv: true,
      },
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("connection-tab-connection").getAttribute("aria-pressed")
      ).toBe("true");
    });

    expect(screen.getByTestId("openrag-api-key-input")).toBeTruthy();
    expect(screen.queryByTestId("huggingface-api-key-input")).toBeNull();

    openAiTab();

    expect(screen.getByTestId("huggingface-api-key-input")).toBeTruthy();
    expect(screen.queryByTestId("openrag-api-key-input")).toBeNull();
    expect(screen.getByTestId("connection-tab-ai").textContent).toContain(
      "granite3.1-dense"
    );
    expect(screen.getByText("Hugging Face API Key")).toBeTruthy();
    expect(screen.getByText("Provider Source")).toBeTruthy();
    expect(screen.getByText("Chat Model")).toBeTruthy();
    expect(screen.getByText("Embedding Model")).toBeTruthy();
    expect(screen.getByText("Ollama · Local fallback")).toBeTruthy();
    expect(screen.getByText("granite3.1-dense:8b")).toBeTruthy();
    expect(screen.getByText("granite-embedding:278m")).toBeTruthy();
  });

  it("opens on the connection tab when OpenRAG is already active", async () => {
    mockAiStatus(READY_AI_STATUS, { hasApiKey: true });

    renderDialog({
      knowledgeBackendMode: "openrag",
      currentOpenragConnection: {
        kind: "openrag",
        apiKey: "",
        baseUrl: "https://openrag.example.com",
        fromEnv: true,
      },
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("connection-tab-connection").getAttribute("aria-pressed")
      ).toBe("true");
    });

    expect(screen.getByTestId("openrag-api-key-input")).toBeTruthy();
    expect(screen.getByTestId("astra-token-input")).toBeTruthy();
  });

  it("merges backend and OpenRAG controls into a single connection tab", async () => {
    mockAiStatus(READY_AI_STATUS, { hasApiKey: true });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId("connection-tab-connection")).toBeTruthy();
    });

    expect(screen.queryByTestId("connection-tab-knowledge")).toBeNull();
    expect(screen.getByText("Data API Backend")).toBeTruthy();
    expect(screen.getByText("Knowledge Mode")).toBeTruthy();
  });
});
