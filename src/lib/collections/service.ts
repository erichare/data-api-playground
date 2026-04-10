import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
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
  metric: string;
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
  md5_hash: string;
  chunk_total: number;
  collection: string;
  ingested_at: string;
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
    md5_hash: row.md5_hash,
    chunk_total: row.chunk_total,
    collection: row.collection,
    ingested_at: row.ingested_at,
  }));
}

export async function createCollectionInAstra(
  args: CreateCollectionArgs
): Promise<Collection> {
  const { token, endpoint, keyspace } = resolveAstraConnection(args, {
    includeDefaultKeyspace: true,
  });
  const { name, dimension, metric, provider, model } = args;

  if (!token || !endpoint || !name) {
    throw new Error("token, endpoint, and name are required");
  }

  const db = getAstraDb(token, endpoint, keyspace);
  const hasVectorize = provider !== "none";
  const vectorOptions = {
    vector: {
      dimension,
      metric: metric as "cosine" | "dot_product" | "euclidean",
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
    vectorDim: dimension,
    vectorizeService: hasVectorize ? { provider, modelName: model } : null,
  };
}

export async function deleteCollectionInAstra(args: DeleteCollectionArgs) {
  const { token, endpoint, keyspace } = resolveAstraConnection(args, {
    includeDefaultKeyspace: true,
  });

  if (!token || !endpoint) {
    throw new Error("Missing credentials");
  }
  if (!args.name) {
    throw new Error("Missing collection name");
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
  const db = getDb();

  db.prepare("DELETE FROM ingested_documents WHERE source_doc_id = ?").run(source_doc_id);

  const { token, endpoint, keyspace } = resolveAstraConnection(args, {
    includeDefaultKeyspace: true,
  });

  if (token && endpoint) {
    try {
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
    } catch {
      // Local metadata delete is the authoritative operation here.
    }
  }

  return { ok: true };
}
