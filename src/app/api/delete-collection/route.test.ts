import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteCollectionInAstraMock = vi.fn();

vi.mock("@/lib/collections/service", () => ({
  deleteCollectionInAstra: deleteCollectionInAstraMock,
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
      })
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
      })
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
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "drop failed",
    });
  });
});
