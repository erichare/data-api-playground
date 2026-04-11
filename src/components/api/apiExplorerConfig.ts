import type { Collection } from "@/lib/types";

export type OpId =
  | "find"
  | "findOne"
  | "insertMany"
  | "updateOne"
  | "deleteOne"
  | "vectorSearch"
  | "estimatedCount";

export type CodeLang = "ts" | "python" | "java" | "curl";

export interface Op {
  id: OpId;
  category: "documents" | "vector" | "collection";
  label: string;
  description: string;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  latencyMs: number;
  data: unknown;
}

export interface ClientCallLogEntry {
  id: string;
  label: string;
  code: string;
  timestamp: string;
}

export const OPS: Op[] = [
  {
    id: "find",
    category: "documents",
    label: "Find",
    description: "Retrieve documents with optional filter and limit",
  },
  {
    id: "findOne",
    category: "documents",
    label: "Find One",
    description: "Retrieve the first document matching a filter",
  },
  {
    id: "insertMany",
    category: "documents",
    label: "Insert Many",
    description: "Insert one or more documents into the collection",
  },
  {
    id: "updateOne",
    category: "documents",
    label: "Update One",
    description: "Update the first document matching a filter",
  },
  {
    id: "deleteOne",
    category: "documents",
    label: "Delete One",
    description: "Delete the first document matching a filter",
  },
  {
    id: "vectorSearch",
    category: "vector",
    label: "Vector Search",
    description: "Find semantically similar documents by vector similarity",
  },
  {
    id: "estimatedCount",
    category: "collection",
    label: "Estimated Count",
    description: "Get an estimated count of documents in the collection",
  },
];

export const CATEGORIES: { id: Op["category"]; label: string }[] = [
  { id: "documents", label: "Documents" },
  { id: "vector", label: "Vector" },
  { id: "collection", label: "Collection" },
];

export const CODE_LANGS: CodeLang[] = ["ts", "python", "java", "curl"];

export const LANG_META: Record<CodeLang, { label: string; badge: string }> = {
  ts: { label: "TypeScript", badge: "astra-db-ts" },
  python: { label: "Python", badge: "astrapy" },
  java: { label: "Java", badge: "astra-db-java" },
  curl: { label: "cURL", badge: "Data API" },
};

export function getDefaultBody(op: OpId, collection?: Collection): string {
  const hasVectorize = Boolean(collection?.vectorizeService);
  const vectorDimension = collection?.vectorDim ?? 3;
  const placeholderVector = Array.from(
    { length: Math.min(vectorDimension, 5) },
    (_, index) => parseFloat(((index + 1) * 0.1).toFixed(1))
  );

  const bodies: Record<OpId, unknown> = {
    find: { find: { filter: {}, options: { limit: 10 } } },
    findOne: { findOne: { filter: {} } },
    insertMany: { insertMany: { documents: [{ field: "value" }] } },
    updateOne: {
      updateOne: {
        filter: {},
        update: { $set: { field: "new_value" } },
      },
    },
    deleteOne: { deleteOne: { filter: {} } },
    vectorSearch: hasVectorize
      ? {
          find: {
            sort: { $vectorize: "sample query text" },
            options: { limit: 5, includeSimilarity: true },
          },
        }
      : {
          find: {
            sort: { $vector: placeholderVector },
            options: { limit: 5, includeSimilarity: true },
          },
        },
    estimatedCount: { estimatedDocumentCount: {} },
  };

  return JSON.stringify(bodies[op], null, 2);
}

export function getCode(
  op: OpId,
  collectionName: string,
  body: string,
  lang: CodeLang,
  keyspace: string
): string {
  const collection = collectionName || "my_collection";
  const resolvedKeyspace = keyspace || "default_keyspace";

  if (lang === "curl") {
    return (
      `curl -sS -X POST \\\n` +
      `  "$ASTRA_DB_ENDPOINT/api/json/v1/${resolvedKeyspace}/${collection}" \\\n` +
      `  -H "Token: $ASTRA_DB_TOKEN" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -d '${body}'`
    );
  }

  const snippets: Record<OpId, Record<Exclude<CodeLang, "curl">, string>> = {
    find: {
      ts: `import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${collection}");

const docs = await col.find({}, { limit: 10 }).toArray();`,
      python: `from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${collection}")

docs = list(col.find({}, limit=10))`,
      java: `DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${collection}");

List<Document> docs = col.find().toList();`,
    },
    findOne: {
      ts: `import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${collection}");

const doc = await col.findOne({});`,
      python: `from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${collection}")

doc = col.find_one({})`,
      java: `DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${collection}");

Optional<Document> doc = col.findOne(new Filter());`,
    },
    insertMany: {
      ts: `import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${collection}");

const result = await col.insertMany([{ field: "value" }]);`,
      python: `from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${collection}")

result = col.insert_many([{"field": "value"}])`,
      java: `DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${collection}");

InsertManyResult result = col.insertMany(
    List.of(new Document().append("field", "value")));`,
    },
    updateOne: {
      ts: `import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${collection}");

await col.updateOne({}, { $set: { field: "new_value" } });`,
      python: `from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${collection}")

col.update_one({}, {"$set": {"field": "new_value"}})`,
      java: `DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${collection}");

col.updateOne(new Filter(), Updates.set("field", "new_value"));`,
    },
    deleteOne: {
      ts: `import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${collection}");

const result = await col.deleteOne({});`,
      python: `from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${collection}")

result = col.delete_one({})`,
      java: `DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${collection}");

DeleteResult result = col.deleteOne(new Filter());`,
    },
    vectorSearch: {
      ts: `import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${collection}");

const results = await col.find(
  {},
  {
    sort: { $vectorize: "sample query text" },
    limit: 5,
    includeSimilarity: true,
  }
).toArray();`,
      python: `from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${collection}")

results = list(col.find(
    {},
    sort={"$vectorize": "sample query text"},
    limit=5,
    include_similarity=True,
))`,
      java: `DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${collection}");

List<Document> results = col.find(
    new Filter(),
    new FindOptions()
        .sort(Sorts.vectorize("sample query text"))
        .limit(5)
        .includeSimilarity()
).toList();`,
    },
    estimatedCount: {
      ts: `import { DataAPIClient } from "@datastax/astra-db-ts";

const client = new DataAPIClient(process.env.ASTRA_DB_TOKEN!);
const db = client.db(process.env.ASTRA_DB_ENDPOINT!);
const col = db.collection("${collection}");

const count = await col.estimatedDocumentCount();`,
      python: `from astrapy import DataAPIClient
import os

client = DataAPIClient(os.environ["ASTRA_DB_TOKEN"])
db = client.get_database(os.environ["ASTRA_DB_ENDPOINT"])
col = db.get_collection("${collection}")

count = col.estimated_document_count()`,
      java: `DataAPIClient client = new DataAPIClient(System.getenv("ASTRA_DB_TOKEN"));
Database db = client.getDatabase(System.getenv("ASTRA_DB_ENDPOINT"));
Collection<Document> col = db.getCollection("${collection}");

long count = col.estimatedDocumentCount();`,
    },
  };

  return snippets[op][lang];
}

export function getEndpointPath(keyspace: string, collectionName: string): string {
  const resolvedKeyspace = keyspace || "default_keyspace";
  return `…/api/json/v1/${resolvedKeyspace}/${collectionName || "{collection}"}`;
}

export function normalizeProxyResponse(
  data: ApiResponse & { error?: string }
): ApiResponse {
  if (data.error && !data.status) {
    return {
      status: 500,
      statusText: "Error",
      latencyMs: 0,
      data: { error: data.error },
    };
  }

  return data;
}

export function createNetworkErrorResponse(error: unknown): ApiResponse {
  return {
    status: 0,
    statusText: "Network Error",
    latencyMs: 0,
    data: { error: String(error) },
  };
}
