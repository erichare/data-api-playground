import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { NEXT_PROXY_CLIENT_MAX_BODY_SIZE } from "@/lib/server/requestLimits";

describe("next.config", () => {
  it("matches the ingest proxy body limit so large uploads are not truncated", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe(
      NEXT_PROXY_CLIENT_MAX_BODY_SIZE
    );
  });
});
