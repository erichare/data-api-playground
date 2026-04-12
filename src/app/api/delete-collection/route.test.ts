import { beforeEach, describe, expect, it, vi } from "vitest";

class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ValidationError"; }
}

const deleteCollectionInAstraMock = vi.fn();

vi.mock("@/lib/collections/service", () => ({
  deleteCollectionInAstra: deleteCollectionInAstraMock,
  ValidationError,
}));

describe("/api/delete-collection route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PLAYGROUND_AUTH_PASSWORD;
  });

  it("deletes a collection through the service layer", async () => {
    deleteCollectionInAstraMock.mockResolvedValueOnce({ dropped: true });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/delete-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "docs" }),
      }) as never
    );

    expect(await response.json()).toEqual({ dropped: true });
    expect(deleteCollectionInAstraMock).toHaveBeenCalledWith({ name: "docs" });
  });

  it("returns 400 for validation-style service errors", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/delete-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Validation failed",
      details: expect.any(Array),
    });
  });

  it("returns 500 for unexpected deletion failures", async () => {
    deleteCollectionInAstraMock.mockRejectedValueOnce(new Error("drop failed"));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/delete-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "docs" }),
      }) as never
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "drop failed",
    });
  });
});
