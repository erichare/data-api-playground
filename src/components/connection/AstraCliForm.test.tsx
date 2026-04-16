// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AstraCliStatus } from "@/lib/astraCli";
import { AstraCliForm } from "@/components/connection/AstraCliForm";

afterEach(cleanup);

function makeStatus(overrides: Partial<AstraCliStatus> = {}): AstraCliStatus {
  return {
    available: true,
    configured: true,
    selectedProfile: "default",
    profiles: [
      { name: "default", isDefault: true },
      { name: "team", isDefault: false },
    ],
    databases: [
      { id: "db-1", name: "primary", endpoint: "https://db1", region: "us-east1" },
      { id: "db-2", name: "secondary", endpoint: "https://db2", region: "eu-west1" },
    ],
    error: null,
    ...overrides,
  } as AstraCliStatus;
}

describe("AstraCliForm", () => {
  it("renders the default profile hint, region, resolved endpoint, and CLI error", () => {
    const status = makeStatus({ error: "astra not authenticated" });
    render(
      <AstraCliForm
        astraCliStatus={status}
        astraCliProfile="team"
        setAstraCliProfile={vi.fn()}
        astraCliDatabase="db-2"
        setAstraCliDatabase={vi.fn()}
      />
    );

    expect(screen.getByText(/Default: default/)).toBeTruthy();
    expect(screen.getByText("eu-west1")).toBeTruthy();
    expect(screen.getByText("https://db2")).toBeTruthy();
    expect(screen.getByText("astra not authenticated")).toBeTruthy();
  });

  it("hides the resolved endpoint and region when no database is selected", () => {
    render(
      <AstraCliForm
        astraCliStatus={makeStatus({ selectedProfile: "" })}
        astraCliProfile=""
        setAstraCliProfile={vi.fn()}
        astraCliDatabase=""
        setAstraCliDatabase={vi.fn()}
      />
    );

    expect(screen.queryByText(/Default:/)).toBeNull();
    expect(screen.queryByText(/Resolved Endpoint/)).toBeNull();
  });

  it("renders without crashing when astra CLI status is null", () => {
    render(
      <AstraCliForm
        astraCliStatus={null}
        astraCliProfile=""
        setAstraCliProfile={vi.fn()}
        astraCliDatabase=""
        setAstraCliDatabase={vi.fn()}
      />
    );

    expect(screen.getByTestId("astra-cli-profile-select")).toBeTruthy();
    expect(screen.getByTestId("astra-cli-database-select")).toBeTruthy();
  });
});
