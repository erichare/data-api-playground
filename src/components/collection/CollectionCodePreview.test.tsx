// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CollectionCodePreview } from "./CollectionCodePreview";

describe("CollectionCodePreview", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders client-side collection definitions across languages", () => {
    render(
      <CollectionCodePreview
        name="orders"
        dimension={768}
        metric="cosine"
        mode="client"
        provider="nvidia"
        model="NV-Embed-QA"
      />
    );

    expect(screen.getByText("astra-db-ts")).toBeTruthy();
    expect(screen.getByText('"orders"')).toBeTruthy();
    expect(screen.getByText("768")).toBeTruthy();

    fireEvent.click(screen.getByText("Py"));
    expect(screen.getByText("astrapy · python")).toBeTruthy();
    expect(screen.getByText("VectorMetric")).toBeTruthy();
    expect(screen.getByText("COSINE")).toBeTruthy();

    fireEvent.click(screen.getByText("Java"));
    expect(screen.getByText("astra-db-java")).toBeTruthy();
    expect(screen.getByText("SimilarityMetric")).toBeTruthy();
  });

  it("renders vectorize service definitions and curl output", () => {
    render(
      <CollectionCodePreview
        name=""
        dimension={1536}
        metric="dot_product"
        mode="vectorize"
        provider="openai"
        model="text-embedding-3-small"
      />
    );

    fireEvent.click(screen.getByText("cURL"));

    expect(screen.getByText("Data API")).toBeTruthy();
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('"provider": "openai"') ?? false
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('"modelName": "text-embedding-3-small"') ?? false
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes('"name": "my_collection"') ?? false
      ).length
    ).toBeGreaterThan(0);
  });
});
