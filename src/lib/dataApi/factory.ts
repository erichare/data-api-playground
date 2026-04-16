/* eslint-disable security/detect-object-injection -- Data API adapter builds query/filter objects from validated field/operator inputs. */
import { getAstraDb, SYSTEM_FIELDS } from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import type { BackendConnectionState, DataApiBackendKind } from "@/lib/backends/types";
import { mapWithConcurrency } from "@/lib/concurrency";
import { logInfo } from "@/lib/server/log";
import type { CollectionDescription } from "@/lib/ingest/types";
import type {
  DataApiBackend,
  DataApiBrowseRequest,
  DataApiConnectResult,
  DataApiCreateCollectionRequest,
  DataApiDeleteDocumentsRequest,
  DataApiProxyRequest,
  ProviderModel,
} from "@/lib/dataApi/types";
import type { Collection } from "@/lib/types";

type DataApiDb = ReturnType<typeof getAstraDb>;
type CollectionMetadata = { count: number | null; fields: string[] };

const CONNECT_METADATA_SAMPLE_LIMIT = 12;
const CONNECT_METADATA_CONCURRENCY = 4;
const CONNECT_FIELD_SAMPLE_SIZE = 1;

interface DataApiBackendFactoryArgs {
  kind: DataApiBackendKind;
  displayName: string;
  capabilities: DataApiBackend["capabilities"];
  createDb: (config: BackendConnectionState, keyspace?: string) => DataApiDb;
  listKeyspaces: (config: BackendConnectionState) => Promise<string[]>;
  listEmbeddingProviders?: (config: BackendConnectionState) => Promise<ProviderModel[]>;
}

function mapCollectionDescriptionToCollection(
  description: CollectionDescription,
  documentCount: number
): Collection {
  const vectorDef = description.definition?.vector;
  const service = vectorDef?.service;

  return {
    name: description.name,
    vectorDim: vectorDef?.dimension ?? null,
    vectorizeService: service
      ? {
          provider: service.provider ?? "unknown",
          modelName: service.modelName ?? "unknown",
        }
      : null,
    count: null,
    documentCount,
  };
}

function getDocFields(doc: Record<string, unknown>) {
  const fields = new Set<string>();
  for (const key of Object.keys(doc)) {
    if (!SYSTEM_FIELDS.has(key)) {
      fields.add(key);
    }
  }
  return Array.from(fields);
}

async function fetchCollectionMetadata(args: {
  displayName: string;
  db: DataApiDb;
  keyspace?: string;
}): Promise<Omit<DataApiConnectResult, "keyspaces" | "resolvedKeyspace">> {
  const { displayName, db } = args;

  recordAstraClientCall({
    label: `Connect to ${displayName}`,
    code: buildTsCall("db", [
      formatTsMethodCall("listCollections", [{ nameOnly: false }]),
    ]),
  });
  const collectionDescriptions = (await db.listCollections({
    nameOnly: false,
  })) as CollectionDescription[];

  const fields: Record<string, string[]> = {};
  const metadata = await mapWithConcurrency(
    collectionDescriptions
      .slice(0, CONNECT_METADATA_SAMPLE_LIMIT)
      .map((collection) => collection.name),
    CONNECT_METADATA_CONCURRENCY,
    async (collectionName): Promise<[string, CollectionMetadata]> => {
      const collection = db.collection(collectionName);
      let count: number | null = null;

      try {
        recordAstraClientCall({
          label: "Collection Estimated Count",
          code: buildTsCall(`db.collection(${JSON.stringify(collectionName)})`, [
            formatTsMethodCall("estimatedDocumentCount", []),
          ]),
        });
        count = await collection.estimatedDocumentCount();
      } catch (err) {
        logInfo(
          { requestId: "", route: "/api/connect", method: "POST" },
          "connect.estimatedDocumentCount.failed",
          { collection: collectionName, error: err instanceof Error ? err.message : String(err) }
        );
      }

      try {
        recordAstraClientCall({
          label: "Sample Collection Fields",
          code: buildTsCall(`db.collection(${JSON.stringify(collectionName)})`, [
            formatTsMethodCall("find", [{}, { limit: CONNECT_FIELD_SAMPLE_SIZE }]),
            ".toArray()",
          ]),
        });
        const sample = await collection.find({}, { limit: CONNECT_FIELD_SAMPLE_SIZE }).toArray();
        const sampleFields = sample.flatMap((doc) => getDocFields(doc as Record<string, unknown>));
        return [collectionName, { count, fields: Array.from(new Set(sampleFields)) }];
      } catch (err) {
        logInfo(
          { requestId: "", route: "/api/connect", method: "POST" },
          "connect.fieldSampling.failed",
          { collection: collectionName, error: err instanceof Error ? err.message : String(err) }
        );
      }

      return [collectionName, { count, fields: [] }];
    }
  );

  const metadataByCollection = new Map(
    metadata
      .filter(
        (
          result
        ): result is PromiseSettledResult<[string, CollectionMetadata]> & { status: "fulfilled" } =>
          result.status === "fulfilled"
      )
      .map((result) => result.value)
  );

  for (const [name, value] of metadataByCollection) {
    if (value.fields.length > 0) {
      fields[name] = value.fields;
    }
  }

  return {
    collections: collectionDescriptions.map((description) => {
      const metadataEntry = metadataByCollection.get(description.name);
      const collection = mapCollectionDescriptionToCollection(description, 0);
      return {
        ...collection,
        count: metadataEntry?.count ?? null,
      };
    }),
    fields,
  };
}

function redactVectorFields(doc: Record<string, unknown>) {
  const value = doc.$vector;
  if (!Array.isArray(value)) {
    return doc;
  }
  return {
    ...doc,
    $vector: `__vector_${value.length}__`,
  };
}

async function executeProxyOperation(
  collectionRef: ReturnType<DataApiDb["collection"]>,
  collection: string,
  operation: string,
  payload: unknown
) {
  switch (operation) {
    case "find": {
      const args = (payload ?? {}) as {
        filter?: Record<string, unknown>;
        sort?: Record<string, unknown>;
        options?: Record<string, unknown>;
      };
      const options = {
        ...(args.options ?? {}),
        ...(args.sort ? { sort: args.sort } : {}),
      } as Parameters<ReturnType<DataApiDb["collection"]>["find"]>[1];
      recordAstraClientCall({
        label: "API Explorer: Find",
        code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
          formatTsMethodCall("find", [args.filter ?? {}, options]),
          ".toArray()",
        ]),
      });
      return collectionRef.find(args.filter ?? {}, options).toArray();
    }
    case "findOne": {
      const args = (payload ?? {}) as {
        filter?: Record<string, unknown>;
        options?: Record<string, unknown>;
      };
      recordAstraClientCall({
        label: "API Explorer: Find One",
        code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
          formatTsMethodCall("findOne", [args.filter ?? {}, args.options ?? {}]),
        ]),
      });
      return collectionRef.findOne(args.filter ?? {}, args.options ?? {});
    }
    case "insertMany": {
      const args = (payload ?? {}) as { documents?: Record<string, unknown>[] };
      recordAstraClientCall({
        label: "API Explorer: Insert Many",
        code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
          formatTsMethodCall("insertMany", [args.documents ?? []]),
        ]),
      });
      return collectionRef.insertMany(args.documents ?? []);
    }
    case "updateOne": {
      const args = (payload ?? {}) as {
        filter?: Record<string, unknown>;
        update?: Record<string, unknown>;
        options?: Record<string, unknown>;
      };
      recordAstraClientCall({
        label: "API Explorer: Update One",
        code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
          formatTsMethodCall("updateOne", [
            args.filter ?? {},
            args.update ?? {},
            args.options ?? {},
          ]),
        ]),
      });
      return collectionRef.updateOne(args.filter ?? {}, args.update ?? {}, args.options ?? {});
    }
    case "deleteOne": {
      const args = (payload ?? {}) as { filter?: Record<string, unknown> };
      recordAstraClientCall({
        label: "API Explorer: Delete One",
        code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
          formatTsMethodCall("deleteOne", [args.filter ?? {}]),
        ]),
      });
      return collectionRef.deleteOne(args.filter ?? {});
    }
    case "estimatedDocumentCount":
      recordAstraClientCall({
        label: "API Explorer: Estimated Count",
        code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
          formatTsMethodCall("estimatedDocumentCount", []),
        ]),
      });
      return collectionRef.estimatedDocumentCount();
    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }
}

export function createDataApiBackend(
  args: DataApiBackendFactoryArgs
): DataApiBackend {
  const {
    kind,
    displayName,
    capabilities,
    createDb,
    listKeyspaces,
    listEmbeddingProviders,
  } = args;

  return {
    kind,
    capabilities,

    async connect(config) {
      let keyspaces: string[] = [];
      if (capabilities.keyspaces) {
        try {
          keyspaces = await listKeyspaces(config);
        } catch {
          keyspaces = [];
        }
      }
      const resolvedKeyspace =
        config.keyspace || (kind === "astra" ? "default_keyspace" : keyspaces[0]);
      const db = createDb(config, resolvedKeyspace);
      const metadata = await fetchCollectionMetadata({
        displayName,
        db,
        keyspace: resolvedKeyspace,
      });
      return {
        ...metadata,
        keyspaces,
        ...(resolvedKeyspace ? { resolvedKeyspace } : {}),
      };
    },

    listKeyspaces,

    async browse(request: DataApiBrowseRequest) {
      const db = createDb(request.config, request.config.keyspace);
      const collection = db.collection(request.collection);
      const sortObj = request.sort ? { [request.sort.col]: request.sort.dir } : undefined;

      recordAstraClientCall({
        label: "Browse Collection",
        code: buildTsCall(`db.collection(${JSON.stringify(request.collection)})`, [
          formatTsMethodCall("find", [{}, { limit: 20, ...(sortObj ? { sort: sortObj } : {}) }]),
          ...(request.pageState ? [formatTsMethodCall("initialPageState", [request.pageState])] : []),
          formatTsMethodCall("fetchNextPage", []),
        ]),
      });

      let cursor = collection.find({}, {
        limit: 20,
        ...(sortObj ? { sort: sortObj as Record<string, 1 | -1> } : {}),
      });
      if (request.pageState) {
        cursor = cursor.initialPageState(request.pageState);
      }

      const fetched = await cursor.fetchNextPage();
      return {
        documents: fetched.result.map((doc) => redactVectorFields(doc as Record<string, unknown>)),
        nextPageState: fetched.nextPageState ?? null,
      };
    },

    async count(config, collection) {
      const db = createDb(config, config.keyspace);
      recordAstraClientCall({
        label: "Count Documents",
        code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
          formatTsMethodCall("estimatedDocumentCount", []),
        ]),
      });
      return db.collection(collection).estimatedDocumentCount();
    },

    async sampleFields(config, collectionName) {
      const db = createDb(config, config.keyspace);
      const sample = await db.collection(collectionName).find({}, { limit: 1 }).toArray();
      return Array.from(new Set(sample.flatMap((doc) => getDocFields(doc as Record<string, unknown>))));
    },

    async createCollection(request: DataApiCreateCollectionRequest) {
      const { config, name, dimension, metric, provider, model } = request;
      if (provider !== "none" && !capabilities.vectorizeCollections) {
        throw new Error(`${displayName} does not support server-side vectorize collections`);
      }

      const db = createDb(config, config.keyspace);
      const hasVectorize = provider !== "none";
      const vectorOptions = {
        vector: {
          dimension,
          metric,
          ...(hasVectorize ? { service: { provider, modelName: model } } : {}),
        },
      };

      recordAstraClientCall({
        label: "Create Collection",
        code: buildTsCall("db", [
          formatTsMethodCall("createCollection", [name, vectorOptions]),
        ]),
      });
      await db.createCollection(name, vectorOptions);

      return {
        name,
        count: 0,
        documentCount: 0,
        vectorDim: dimension,
        vectorizeService: hasVectorize ? { provider, modelName: model } : null,
      };
    },

    async deleteCollection(config, name) {
      const db = createDb(config, config.keyspace);
      recordAstraClientCall({
        label: "Delete Collection",
        code: buildTsCall("db", [
          formatTsMethodCall("dropCollection", [name]),
        ]),
      });
      await db.dropCollection(name);
      return { dropped: true };
    },

    async deleteDocuments(request: DataApiDeleteDocumentsRequest) {
      const db = createDb(request.config, request.config.keyspace);
      const collection = db.collection(request.collection);
      recordAstraClientCall({
        label: "Delete Documents",
        code: buildTsCall(`db.collection(${JSON.stringify(request.collection)})`, [
          formatTsMethodCall("deleteMany", [{ _id: { $in: request.ids } }]),
        ]),
      });
      return collection.deleteMany({ _id: { $in: request.ids } });
    },

    async listEmbeddingProviders(config) {
      if (!listEmbeddingProviders || !capabilities.embeddingProviders) {
        throw new Error(`${displayName} does not support embedding provider discovery`);
      }
      return listEmbeddingProviders(config);
    },

    async proxy(request: DataApiProxyRequest) {
      if (!capabilities.apiProxy) {
        throw new Error(`${displayName} does not support API Explorer operations`);
      }

      const db = createDb(request.config, request.config.keyspace);
      const collection = db.collection(request.collection);
      const firstCommand = Object.entries(request.requestBody)[0];
      if (!firstCommand) {
        throw new Error("Request body must contain an operation");
      }

      const [operation, payload] = firstCommand;
      return executeProxyOperation(collection, request.collection, operation, payload);
    },
  };
}

export function createNonAstraListKeyspaces(
  createDb: DataApiBackendFactoryArgs["createDb"],
  environment: Exclude<DataApiBackendKind, "astra">
) {
  return async (config: BackendConnectionState) => {
    const db = createDb(config);
    recordAstraClientCall({
      label: "List Keyspaces",
      code: buildTsCall(`db.admin({ environment: ${JSON.stringify(environment)} })`, [
        formatTsMethodCall("listKeyspaces", []),
      ]),
    });
    return db.admin({ environment }).listKeyspaces();
  };
}

export function createAstraListKeyspaces(
  createDb: DataApiBackendFactoryArgs["createDb"]
) {
  return async (config: BackendConnectionState) => {
    const db = createDb(config);
    recordAstraClientCall({
      label: "List Keyspaces",
      code: buildTsCall("db.admin()", [
        formatTsMethodCall("listKeyspaces", []),
      ]),
    });
    return db.admin().listKeyspaces();
  };
}

export function createAstraEmbeddingProviders(
  createDb: DataApiBackendFactoryArgs["createDb"]
) {
  return async (config: BackendConnectionState) => {
    const db = createDb(config, config.keyspace);
    recordAstraClientCall({
      label: "List Embedding Providers",
      code: buildTsCall("db.admin()", [
        formatTsMethodCall("findEmbeddingProviders", []),
      ]),
    });
    const response = await db.admin().findEmbeddingProviders();
    const embeddingProviders = response?.embeddingProviders ?? {};
    return Object.entries(embeddingProviders).flatMap(([providerId, info]) =>
      info.models.map((model) => ({
        provider: providerId,
        providerDisplayName: info.displayName,
        modelName: model.name,
        vectorDimension: model.vectorDimension,
      }))
    );
  };
}
