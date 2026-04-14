import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { NEXT_PROXY_CLIENT_MAX_BODY_SIZE } from "@/lib/server/requestLimits";

describe("next.config", () => {
  it("matches the ingest proxy body limit so large uploads are not truncated", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe(
      NEXT_PROXY_CLIENT_MAX_BODY_SIZE
    );
  });

  it("enables SRI and keeps the CSP aligned with the shipped shell", async () => {
    expect(nextConfig.experimental?.sri).toEqual({ algorithm: "sha256" });

    const headers = await nextConfig.headers?.();
    const csp = headers?.[0]?.headers.find(
      (header) => header.key === "Content-Security-Policy"
    )?.value;

    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("form-action 'self'");
  });
});
