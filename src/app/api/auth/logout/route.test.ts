import { describe, expect, it } from "vitest";

describe("/api/auth/logout route", () => {
  it("clears the auth cookie", async () => {
    const { POST } = await import("./route");
    const response = await POST();

    expect(await response.json()).toEqual({ authenticated: false });
    expect(response.headers.get("set-cookie")).toContain("dap_auth=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
