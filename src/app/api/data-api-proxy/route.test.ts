import { beforeEach, describe, expect, it, vi } from "vitest";

const getAstraDbMock = vi.fn();
const isAllowedAstraEndpointMock = vi.fn();
const resolveAstraConnectionMock = vi.fn();
const findMock = vi.fn();
const findOneMock = vi.fn();
const insertManyMock = vi.fn();
const updateOneMock = vi.fn();
const deleteOneMock = vi.fn();
const estimatedDocumentCountMock = vi.fn();
const collectionMock = vi.fn();

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  isAllowedAstraEndpoint: isAllowedAstraEndpointMock,
  resolveAstraConnection: resolveAstraConnectionMock,
}));

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/data-api-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("/api/data-api-proxy route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resolveAstraConnectionMock.mockReturnValue({
      token: "AstraCS:test",
      endpoint: "https://db-id-us-east1.apps.astra.datastax.com",
      keyspace: "default_keyspace",
    });
    isAllowedAstraEndpointMock.mockReturnValue(true);
    collectionMock.mockReturnValue({
      find: findMock,
      findOne: findOneMock,
      insertMany: insertManyMock,
      updateOne: updateOneMock,
      deleteOne: deleteOneMock,
      estimatedDocumentCount: estimatedDocumentCountMock,
    });
    getAstraDbMock.mockReturnValue({
      collection: collectionMock,
    });
  });

  it("rejects non-Astra endpoints", async () => {
    isAllowedAstraEndpointMock.mockReturnValue(false);

    const { POST } = await import("./route");
    const request = makeRequest({
      collection: "docs",
      requestBody: { find: { filter: {} } },
    });

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Endpoint must be a valid Astra DB API endpoint",
      requestId: expect.any(String),
    });
    expect(getAstraDbMock).not.toHaveBeenCalled();
  });

  it("executes supported collection operations through Astra helpers", async () => {
    const toArrayMock = vi.fn().mockResolvedValue([{ title: "Doc 1" }]);
    findMock.mockReturnValue({
      toArray: toArrayMock,
    });

    const { POST } = await import("./route");
    const request = makeRequest({
      collection: "docs",
      requestBody: { find: { filter: { topic: "security" }, options: { limit: 5 } } },
    });

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 200,
      statusText: "OK",
      data: [{ title: "Doc 1" }],
    });
    expect(toArrayMock).toHaveBeenCalled();
  });

  it("returns 400 when Astra credentials are missing", async () => {
    resolveAstraConnectionMock.mockReturnValueOnce({
      token: "",
      endpoint: "",
      keyspace: "default_keyspace",
    });

    const { POST } = await import("./route");
    const response = await POST(
      makeRequest({
        collection: "docs",
        requestBody: { findOne: { filter: { topic: "security" } } },
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Missing Astra DB token or endpoint",
    });
  });

  it("returns 400 when the request body does not contain an operation", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest({
        collection: "docs",
        requestBody: {},
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Request body must contain an operation",
    });
  });

  it.each([
    {
      name: "findOne",
      requestBody: {
        findOne: { filter: { topic: "security" }, options: { projection: { title: 1 } } },
      },
      arrange: () => findOneMock.mockResolvedValueOnce({ title: "Doc 1" }),
      assert: () =>
        expect(findOneMock).toHaveBeenCalledWith(
          { topic: "security" },
          { projection: { title: 1 } }
        ),
      expected: { title: "Doc 1" },
    },
    {
      name: "insertMany",
      requestBody: {
        insertMany: { documents: [{ title: "Doc 1" }, { title: "Doc 2" }] },
      },
      arrange: () =>
        insertManyMock.mockResolvedValueOnce({ insertedCount: 2, insertedIds: ["1", "2"] }),
      assert: () =>
        expect(insertManyMock).toHaveBeenCalledWith([
          { title: "Doc 1" },
          { title: "Doc 2" },
        ]),
      expected: { insertedCount: 2, insertedIds: ["1", "2"] },
    },
    {
      name: "updateOne",
      requestBody: {
        updateOne: {
          filter: { _id: "1" },
          update: { $set: { title: "Updated" } },
          options: { upsert: true },
        },
      },
      arrange: () =>
        updateOneMock.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 }),
      assert: () =>
        expect(updateOneMock).toHaveBeenCalledWith(
          { _id: "1" },
          { $set: { title: "Updated" } },
          { upsert: true }
        ),
      expected: { matchedCount: 1, modifiedCount: 1 },
    },
    {
      name: "deleteOne",
      requestBody: {
        deleteOne: { filter: { _id: "1" } },
      },
      arrange: () => deleteOneMock.mockResolvedValueOnce({ deletedCount: 1 }),
      assert: () => expect(deleteOneMock).toHaveBeenCalledWith({ _id: "1" }),
      expected: { deletedCount: 1 },
    },
    {
      name: "estimatedDocumentCount",
      requestBody: {
        estimatedDocumentCount: {},
      },
      arrange: () => estimatedDocumentCountMock.mockResolvedValueOnce(42),
      assert: () => expect(estimatedDocumentCountMock).toHaveBeenCalledWith(),
      expected: 42,
    },
  ])("supports the $name operation", async ({ requestBody, arrange, assert, expected }) => {
    arrange();

    const { POST } = await import("./route");
    const response = await POST(
      makeRequest({
        collection: "docs",
        requestBody,
      })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(expected);
    assert();
  });

  it("rejects unsupported operations", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest({
        collection: "docs",
        requestBody: { drop: {} },
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Unsupported operation: drop",
    });
  });

  it("returns 500 when the Astra operation throws", async () => {
    deleteOneMock.mockRejectedValueOnce(new Error("delete failed"));

    const { POST } = await import("./route");
    const response = await POST(
      makeRequest({
        collection: "docs",
        requestBody: { deleteOne: { filter: { _id: "1" } } },
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: "delete failed",
    });
  });
});
