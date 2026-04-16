import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import type { DataApiBackendKind } from "@/lib/backends/types";
import { mapCollectionDescriptionToSource } from "@/lib/knowledge/dataApi/collectionConfig";
import {
  normalizeDataApiKnowledgeConfig,
  type CreateDataApiDb,
} from "@/lib/knowledge/dataApi/config";
import { ingestCsvIntoDataApi } from "@/lib/knowledge/dataApi/csvIngest";
import { ingestDocumentIntoDataApi } from "@/lib/knowledge/dataApi/documentIngest";
import { searchDataApiKnowledge } from "@/lib/knowledge/dataApi/search";
import { DATA_API_KNOWLEDGE_BACKEND_CAPABILITIES } from "@/lib/knowledge/types";
import type {
  KnowledgeBackend,
  KnowledgeDocumentChunk,
} from "@/lib/knowledge/types";
import type { CollectionDescription } from "@/lib/ingest/types";

export interface DataApiKnowledgeBackendFactoryArgs {
  kind: Exclude<DataApiBackendKind, never>;
  displayName: string;
  createDb: CreateDataApiDb;
}

export function createDataApiKnowledgeBackend(
  args: DataApiKnowledgeBackendFactoryArgs
): KnowledgeBackend {
  const { kind, displayName, createDb } = args;

  return {
    kind,
    capabilities: DATA_API_KNOWLEDGE_BACKEND_CAPABILITIES,

    async listSources(config) {
      const normalizedConfig = normalizeDataApiKnowledgeConfig(config, displayName);
      const db = createDb(normalizedConfig, normalizedConfig.keyspace);
      const descriptions = (await db.listCollections({
        nameOnly: false,
      })) as CollectionDescription[];
      return descriptions.map(mapCollectionDescriptionToSource);
    },

    search(request) {
      return searchDataApiKnowledge(request, createDb, displayName);
    },

    ingestCsv(request, send) {
      return ingestCsvIntoDataApi(request, send, createDb, displayName);
    },

    ingestDocument(request, send) {
      return ingestDocumentIntoDataApi(request, send, createDb, displayName);
    },

    async deleteDocument(request) {
      const { config, source, documentRef } = request;
      const normalizedConfig = normalizeDataApiKnowledgeConfig(config, displayName);

      const db = createDb(normalizedConfig, normalizedConfig.keyspace);
      recordAstraClientCall({
        label: "Delete Ingested Document",
        code: buildTsCall(`db.collection(${JSON.stringify(source)})`, [
          formatTsMethodCall("deleteMany", [
            { "metadata.source_doc_id": { $eq: documentRef } },
          ]),
        ]),
      });
      await db.collection(source).deleteMany({
        "metadata.source_doc_id": { $eq: documentRef },
      });
    },

    async loadDocumentContent(request): Promise<KnowledgeDocumentChunk[]> {
      const { config, source, documentRef } = request;
      const normalizedConfig = normalizeDataApiKnowledgeConfig(config, displayName);

      const db = createDb(normalizedConfig, normalizedConfig.keyspace);
      const coll = db.collection(source);
      const findCall = formatTsMethodCall("find", [
        { "metadata.source_doc_id": { $eq: documentRef } },
        {
          projection: { content: 1, metadata: 1 },
          limit: 1000,
        },
      ]);
      recordAstraClientCall({
        label: "Load Document Chunks",
        code: [
          `const cursor = db.collection(${JSON.stringify(source)})`,
          `  ${findCall};`,
          "",
          "for await (const doc of cursor) {",
          "  // collect content and metadata",
          "}",
        ].join("\n"),
      });

      const cursor = coll.find(
        { "metadata.source_doc_id": { $eq: documentRef } },
        {
          projection: { content: 1, metadata: 1 },
          limit: 1000,
        }
      );

      const chunks: KnowledgeDocumentChunk[] = [];
      for await (const doc of cursor) {
        const meta = (doc.metadata ?? {}) as Record<string, unknown>;
        const chunkIndex = typeof meta.chunk_index === "number" ? meta.chunk_index : 0;
        const content = typeof doc.content === "string" ? doc.content : String(doc.content ?? "");
        chunks.push({ chunk_index: chunkIndex, content });
      }

      chunks.sort((left, right) => left.chunk_index - right.chunk_index);
      return chunks;
    },
  };
}
