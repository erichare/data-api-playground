import { getAstraDb, resolveAstraConnection, SYSTEM_FIELDS } from "@/lib/astra";

/** Thrown for client-side validation errors (missing fields, bad input). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import { getDb } from "@/lib/db";
import type { Collection, IngestedDocumentSummary } from "@/lib/types";

type CollectionConnectionArgs = {
  token?: string;
  endpoint?: string;
  keyspace?: string;
};

type CreateCollectionArgs = CollectionConnectionArgs & {
  name: string;
  dimension: number;
  metric: "cosine" | "dot_product" | "euclidean";
  provider: string;
  model: string;
};

type DeleteCollectionArgs = CollectionConnectionArgs & {
  name: string;
};

type DeleteIngestedDocumentArgs = CollectionConnectionArgs & {
  source_doc_id: string;
  collection: string;
};

type DocRow = {
  source_doc_id: string;
  source_filename: string;
  file_type: string;
  file_size: number;
  content_hash: string;
  chunk_total: number;
  collection: string;
  ingested_at: string;
};

type DocumentCountRow = {
  collection: string;
  document_count: number;
};

export function listIngestedDocuments(collection?: string): IngestedDocumentSummary[] {
  const db = getDb();
  const rows = (collection
    ? db
        .prepare(
          "SELECT * FROM ingested_documents WHERE collection = ? ORDER BY ingested_at DESC LIMIT 500"
        )
        .all(collection)
    : db
        .prepare("SELECT * FROM ingested_documents ORDER BY ingested_at DESC LIMIT 500")
        .all()) as DocRow[];

  return rows.map((row) => ({
    source_doc_id: row.source_doc_id,
    source_filename: row.source_filename,
    file_type: row.file_type as IngestedDocumentSummary["file_type"],
    file_size: row.file_size,
    content_hash: row.content_hash,
    chunk_total: row.chunk_total,
    collection: row.collection,
    ingested_at: row.ingested_at,
  }));
}

function getIngestedDocumentCountsByCollection(): Map<string, number> {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT collection, COUNT(*) AS document_count FROM ingested_documents GROUP BY collection"
    )
    .all() as DocumentCountRow[];

  return new Map(rows.map((row) => [row.collection, row.document_count]));
}

const CONNECT_METADATA_SAMPLE_LIMIT = 12;
const CONNECT_METADATA_CONCURRENCY = 4;
const CONNECT_FIELD_SAMPLE_SIZE = 1;

interface CollectionMetadata {
  count: number | null;
  fields: string[];
}


export async function fetchCollectionMetadata(args: {
  token: string;
  endpoint: string;
  keyspace?: string;
}): Promise<{ collections: Collection[]; fields: Record<string, string[]> }> {
  const { token, endpoint, keyspace } = args;
  const db = getAstraDb(token, endpoint, keyspace);
  const ingestedDocumentCounts = getIngestedDocumentCountsByCollection();

  recordAstraClientCall({
    label: "Connect to Astra",
    code: buildTsCall("db", [
      formatTsMethodCall("listCollections", [{ nameOnly: false }]),
    ]),
  });
  const colls = await db.listCollections({ nameOnly: false });

  const collections: Collection[] = colls.map((c) => {
    const vectorDef = c.definition?.vector;
    const svc = vectorDef?.service;
    return {
      name: c.name,
      vectorDim: vectorDef?.dimension ?? null,
      vectorizeService: svc
        ? { provider: svc.provider, modelName: svc.modelName }
        : null,
      count: null,
      documentCount: ingestedDocumentCounts.get(c.name) ?? 0,
    };
  });

  const sampledCollectionNames = collections
    .filter((collection) => !collection.name.startsWith("dap_"))
    .slice(0, CONNECT_METADATA_SAMPLE_LIMIT)
    .map((collection) => collection.name);

  const fields: Record<string, string[]> = {};
  const sampledMetadata = await mapWithConcurrency(
    sampledCollectionNames,
    CONNECT_METADATA_CONCURRENCY,
    async (collectionName): Promise<[string, CollectionMetadata]> => {
      const collectionRef = db.collection(collectionName);
      let count: number | null = null;

      try {
        recordAstraClientCall({
          label: "Collection Estimated Count",
          code: buildTsCall(`db.collection(${JSON.stringify(collectionName)})`, [
            formatTsMethodCall("estimatedDocumentCount", []),
          ]),
        });
        count = await collectionRef.estimatedDocumentCount();
      } catch (err) {
        console.warn(`[connect] estimatedDocumentCount failed for "${collectionName}":`, err instanceof Error ? err.message : err);
      }

      const fieldSet = new Set<string>();
      try {
        recordAstraClientCall({
          label: "Sample Collection Fields",
          code: buildTsCall(`db.collection(${JSON.stringify(collectionName)})`, [
            formatTsMethodCall("find", [{}, { limit: CONNECT_FIELD_SAMPLE_SIZE }]),
            ".toArray()",
          ]),
        });
        const sample = await collectionRef
          .find({}, { limit: CONNECT_FIELD_SAMPLE_SIZE })
          .toArray();
        for (const doc of sample) {
          for (const key of Object.keys(doc)) {
            if (!SYSTEM_FIELDS.has(key)) fieldSet.add(key);
          }
        }
      } catch (err) {
        console.warn(`[connect] field sampling failed for "${collectionName}":`, err instanceof Error ? err.message : err);
      }

      return [collectionName, { count, fields: Array.from(fieldSet) }];
    }
  );

  const metadataByCollection = new Map(
    sampledMetadata
      .filter((r): r is PromiseSettledResult<[string, CollectionMetadata]> & { status: "fulfilled" } => r.status === "fulfilled")
      .map((r) => r.value)
  );
  const enrichedCollections = collections.map((collection) => {
    const metadata = metadataByCollection.get(collection.name);
    if (!metadata) return collection;
    return { ...collection, count: metadata.count };
  });

  for (const [name, metadata] of metadataByCollection) {
    if (metadata.fields.length > 0) {
      fields[name] = metadata.fields;
    }
  }

  return { collections: enrichedCollections, fields };
}

export async function createCollectionInAstra(
  args: CreateCollectionArgs
): Promise<Collection> {
  const { token, endpoint, keyspace } = resolveAstraConnection(args, {
    includeDefaultKeyspace: true,
  });
  const { name, dimension, metric, provider, model } = args;

  if (!token || !endpoint || !name) {
    throw new ValidationError("token, endpoint, and name are required");
  }

  const db = getAstraDb(token, endpoint, keyspace);
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
}

export async function deleteCollectionInAstra(args: DeleteCollectionArgs) {
  const { token, endpoint, keyspace } = resolveAstraConnection(args, {
    includeDefaultKeyspace: true,
  });

  if (!token || !endpoint) {
    throw new ValidationError("Missing credentials");
  }
  if (!args.name) {
    throw new ValidationError("Missing collection name");
  }

  const db = getAstraDb(token, endpoint, keyspace);
  recordAstraClientCall({
    label: "Delete Collection",
    code: buildTsCall("db", [
      formatTsMethodCall("dropCollection", [args.name]),
    ]),
  });
  await db.dropCollection(args.name);
  return { dropped: true };
}

export async function deleteIngestedDocument(
  args: DeleteIngestedDocumentArgs
): Promise<{ ok: true }> {
  const { source_doc_id, collection } = args;
  const { token, endpoint, keyspace } = resolveAstraConnection(args, {
    includeDefaultKeyspace: true,
  });

  if (token && endpoint) {
    const astraDb = getAstraDb(token, endpoint, keyspace);
    recordAstraClientCall({
      label: "Delete Ingested Document",
      code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
        formatTsMethodCall("deleteMany", [
          { "metadata.source_doc_id": { $eq: source_doc_id } },
        ]),
      ]),
    });
    await astraDb
      .collection(collection)
      .deleteMany({ "metadata.source_doc_id": { $eq: source_doc_id } });
  }

  const db = getDb();
  db.prepare("DELETE FROM ingested_documents WHERE source_doc_id = ?").run(source_doc_id);

  return { ok: true };
}
