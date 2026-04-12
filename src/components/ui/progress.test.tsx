// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "./progress";

vi.mock("@base-ui/react/progress", () => {
  const Root = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  );
  const Track = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  );
  const Indicator = (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props} />
  );
  const Label = ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  );
  const Value = (props: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>50%</span>
  );

  return {
    Progress: {
      Root,
      Track,
      Indicator,
      Label,
      Value,
    },
  };
});

describe("Progress", () => {
  it("renders the composed progress slots", () => {
    render(
      <Progress value={50}>
        <ProgressLabel>Upload</ProgressLabel>
        <ProgressValue />
      </Progress>
    );

    expect(screen.getByText("Upload").getAttribute("data-slot")).toBe(
      "progress-label"
    );
    expect(screen.getByText("50%").getAttribute("data-slot")).toBe(
      "progress-value"
    );
    expect(screen.getByText("Upload").closest("[data-slot='progress']")).toBeTruthy();
    expect(document.querySelector("[data-slot='progress-track']")).toBeTruthy();
    expect(document.querySelector("[data-slot='progress-indicator']")).toBeTruthy();
  });

  it("supports the track and indicator primitives directly", () => {
    render(
      <div>
        <ProgressTrack />
        <ProgressIndicator />
      </div>
    );

    expect(document.querySelector("[data-slot='progress-track']")).toBeTruthy();
    expect(document.querySelector("[data-slot='progress-indicator']")).toBeTruthy();
  });
});
