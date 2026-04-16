import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAstraDbMock,
  embedManyMock,
  ensureModelMock,
  resolveBackendMock,
  recordAstraClientCallMock,
  buildTsCallMock,
  formatTsMethodCallMock,
} = vi.hoisted(() => ({
  getAstraDbMock: vi.fn(),
  embedManyMock: vi.fn(),
  ensureModelMock: vi.fn(),
  resolveBackendMock: vi.fn(),
  recordAstraClientCallMock: vi.fn(),
  buildTsCallMock: vi.fn(() => "ts-call"),
  formatTsMethodCallMock: vi.fn(() => "ts-method"),
}));

vi.mock("@/lib/astra", () => ({
  getAstraDb: getAstraDbMock,
  SYSTEM_FIELDS: new Set(["_id", "$vector", "$similarity"]),
}));

vi.mock("@/lib/ai/service", () => ({
  embedMany: embedManyMock,
  ensureModel: ensureModelMock,
  resolveBackend: resolveBackendMock,
}));

vi.mock("@/lib/astraClientLog", () => ({
  buildTsCall: buildTsCallMock,
  formatTsMethodCall: formatTsMethodCallMock,
  rawTs: (value: unknown) => value,
  recordAstraClientCall: recordAstraClientCallMock,
}));

import { astraKnowledgeBackend } from "@/lib/knowledge";

function runKnowledgeBackendContract() {
  describe("astraKnowledgeBackend contract", () => {
    const config = {
      kind: "astra" as const,
      token: "AstraCS:secret",
      endpoint: "https://db.apps.astra.datastax.com",
      keyspace: "default_keyspace",
    };

    beforeEach(() => {
      vi.clearAllMocks();
      embedManyMock.mockReset();
      ensureModelMock.mockReset();
      resolveBackendMock.mockReset();
      getAstraDbMock.mockReset();
    });

    it("lists logical knowledge sources with vector metadata", async () => {
      getAstraDbMock.mockReturnValue({
        listCollections: vi.fn().mockResolvedValue([
          {
            name: "orders",
            definition: {
              vector: {
                dimension: 768,
                service: {
                  provider: "nvidia",
                  modelName: "NV-Embed-QA",
                },
              },
            },
          },
          {
            name: "notes",
            definition: { vector: { dimension: 384 } },
          },
        ]),
      });

      await expect(astraKnowledgeBackend.listSources(config)).resolves.toEqual([
        {
          name: "orders",
          vectorDimension: 768,
          vectorizeProvider: "nvidia",
          vectorizeModel: "NV-Embed-QA",
        },
        {
          name: "notes",
          vectorDimension: 384,
          vectorizeProvider: null,
          vectorizeModel: null,
        },
      ]);
    });

    it("searches a source through the backend contract", async () => {
      const findMock = vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: "doc-1",
            title: "Quarterly Report",
            $similarity: 0.91,
          },
        ]),
      }));
      getAstraDbMock.mockReturnValue({
        collection: vi.fn(() => ({
          find: findMock,
        })),
      });

      const result = await astraKnowledgeBackend.search({
        config,
        query: "quarterly report",
        collection: "orders",
        collections: [
          { name: "orders", isVectorize: false, vectorDimension: 3 },
        ],
        collectionsToSearch: [
          { name: "orders", isVec: false, vectorDimension: 3 },
        ],
        userCollections: ["orders"],
        searchMode: "vector",
        sortField: null,
        sortDir: "desc",
        limit: 3,
        filterField: null,
        filterOp: null,
        filterValue: null,
        embeddingVector: [0.1, 0.2, 0.3],
      });

      expect(findMock).toHaveBeenCalledWith(
        {},
        {
          sort: { $vector: [0.1, 0.2, 0.3] },
          limit: 3,
          includeSimilarity: true,
        }
      );
      expect(result).toEqual({
        collection: "orders",
        commandStr: expect.stringContaining("$vector"),
        searchResults: [
          {
            id: "doc-1",
            similarity: 0.91,
            preview: { title: "Quarterly Report" },
            collection: "orders",
          },
        ],
      });
    });

    it("ingests CSV rows through the backend contract", async () => {
      const insertManyMock = vi.fn().mockResolvedValue(undefined);
      getAstraDbMock.mockReturnValue({
        collection: vi.fn(() => ({ insertMany: insertManyMock })),
        listCollections: vi.fn().mockResolvedValue([
          {
            name: "orders",
            definition: { vector: { dimension: 3 } },
          },
        ]),
      });
      resolveBackendMock.mockReturnValue({
        provider: "huggingface",
        source: "manual",
        huggingfaceApiKey: "hf-key",
        huggingFaceKeyPresent: true,
        chatModel: "chat-model",
        embedModel: "embed-model",
        ollamaBaseUrl: "http://127.0.0.1:11434",
      });
      ensureModelMock.mockResolvedValue({
        provider: "huggingface",
        model: "embed-model",
        downloaded: false,
        latencyMs: 5,
      });
      embedManyMock.mockResolvedValue({
        embeddings: [[0.1, 0.2, 0.3]],
      });

      const events: Array<Record<string, unknown>> = [];
      await astraKnowledgeBackend.ingestCsv(
        {
          config,
          collection: "orders",
          rows: [{ title: "Quarterly Report" }],
          filename: "rows.csv",
          huggingfaceApiKey: "hf-key",
        },
        (event) => events.push(event)
      );

      expect(events[0]).toMatchObject({
        type: "prepare",
        status: "complete",
      });
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "start",
          collection: "orders",
          useVectorize: false,
          provider: "huggingface",
          model: "embed-model",
        })
      );
      expect(events.at(-1)).toMatchObject({
        type: "complete",
        processed: 1,
        total: 1,
      });
      expect(insertManyMock).toHaveBeenCalledWith([
        expect.objectContaining({
          title: "Quarterly Report",
          $vector: [0.1, 0.2, 0.3],
        }),
      ]);
    });

    it("ingests document chunks and returns backend progress events", async () => {
      const insertManyMock = vi.fn().mockResolvedValue(undefined);
      getAstraDbMock.mockReturnValue({
        collection: vi.fn(() => ({ insertMany: insertManyMock })),
        listCollections: vi.fn().mockResolvedValue([
          {
            name: "orders",
            definition: {
              vector: {
                dimension: 768,
                service: {
                  provider: "nvidia",
                  modelName: "NV-Embed-QA",
                },
              },
            },
          },
        ]),
      });

      const events: Array<Record<string, unknown>> = [];
      await astraKnowledgeBackend.ingestDocument(
        {
          config,
          sourceDocId: "doc-1",
          collectionName: "orders",
          chunks: ["first chunk", "second chunk"],
          metadata: { source_filename: "report.pdf" },
        },
        (event) => events.push(event)
      );

      expect(events[0]).toMatchObject({
        type: "backend_info",
        useVectorize: true,
        provider: "nvidia",
        model: "NV-Embed-QA",
      });
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "chunk_progress",
          processed: 2,
          total: 2,
        })
      );
      expect(events.at(-1)).toMatchObject({
        type: "backend_complete",
        provider: "nvidia",
        model: "NV-Embed-QA",
      });
      expect(insertManyMock).toHaveBeenCalledWith([
        expect.objectContaining({
          content: "first chunk",
          $vectorize: "first chunk",
        }),
        expect.objectContaining({
          content: "second chunk",
          $vectorize: "second chunk",
        }),
      ]);
    });

    it("deletes and reloads stored document content by opaque backend reference", async () => {
      const deleteManyMock = vi.fn().mockResolvedValue({ deletedCount: 1 });
      async function* cursor() {
        yield { content: "second", metadata: { chunk_index: 2 } };
        yield { content: "first", metadata: { chunk_index: 1 } };
      }
      const findMock = vi.fn(() => cursor());
      getAstraDbMock.mockReturnValue({
        collection: vi.fn(() => ({
          deleteMany: deleteManyMock,
          find: findMock,
        })),
      });

      await expect(
        astraKnowledgeBackend.deleteDocument({
          config,
          source: "orders",
          documentRef: "doc-1",
        })
      ).resolves.toBeUndefined();
      expect(deleteManyMock).toHaveBeenCalledWith({
        "metadata.source_doc_id": { $eq: "doc-1" },
      });

      await expect(
        astraKnowledgeBackend.loadDocumentContent({
          config,
          source: "orders",
          documentRef: "doc-1",
        })
      ).resolves.toEqual([
        { chunk_index: 1, content: "first" },
        { chunk_index: 2, content: "second" },
      ]);
      expect(findMock).toHaveBeenCalledWith(
        { "metadata.source_doc_id": { $eq: "doc-1" } },
        {
          projection: { content: 1, metadata: 1 },
          limit: 1000,
        }
      );
    });
  });
}

runKnowledgeBackendContract();
