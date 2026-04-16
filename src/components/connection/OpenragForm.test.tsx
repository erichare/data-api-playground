// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeBackendStatuses } from "@/lib/knowledge/types";
import { OpenragForm } from "@/components/connection/OpenragForm";

afterEach(cleanup);

function makeStatuses(
  overrides: Partial<KnowledgeBackendStatuses["openrag"]> = {}
): KnowledgeBackendStatuses {
  return {
    openrag: {
      kind: "openrag",
      ready: false,
      hasApiKey: false,
      hasBaseUrl: false,
      ...overrides,
    },
  } as KnowledgeBackendStatuses;
}

describe("OpenragForm", () => {
  it("shows env hints when keys exist in the environment but inputs are blank", () => {
    render(
      <OpenragForm
        apiKey=""
        setApiKey={vi.fn()}
        baseUrl=""
        setBaseUrl={vi.fn()}
        showApiKey={false}
        setShowApiKey={vi.fn()}
        knowledgeStatuses={makeStatuses({ hasApiKey: true, hasBaseUrl: true })}
      />
    );

    const envHints = screen.getAllByText("Set via environment");
    expect(envHints).toHaveLength(2);
  });

  it("falls back to the localhost default hint when no env URL is configured", () => {
    render(
      <OpenragForm
        apiKey=""
        setApiKey={vi.fn()}
        baseUrl=""
        setBaseUrl={vi.fn()}
        showApiKey={false}
        setShowApiKey={vi.fn()}
        knowledgeStatuses={makeStatuses()}
      />
    );

    expect(screen.getByText(/Defaults to http:\/\/localhost:3000/)).toBeTruthy();
  });

  it("hides env hints when the user has typed values", () => {
    render(
      <OpenragForm
        apiKey="orag_typed"
        setApiKey={vi.fn()}
        baseUrl="https://typed.example.com"
        setBaseUrl={vi.fn()}
        showApiKey={true}
        setShowApiKey={vi.fn()}
        knowledgeStatuses={makeStatuses({ hasApiKey: true, hasBaseUrl: true })}
      />
    );

    expect(screen.queryByText("Set via environment")).toBeNull();
  });
});
