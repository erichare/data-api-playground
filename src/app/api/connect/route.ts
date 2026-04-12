import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection, SYSTEM_FIELDS } from "@/lib/astra";
import type { Collection } from "@/lib/types";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { createRequestLogContext, jsonError, logError } from "@/lib/server/log";
import { connectBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

const CONNECT_METADATA_SAMPLE_LIMIT = 12;
const CONNECT_METADATA_CONCURRENCY = 4;
const CONNECT_FIELD_SAMPLE_SIZE = 1;

interface CollectionMetadata {
  count: number | null;
  fields: string[];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/connect");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, connectBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint, keyspace } = resolveAstraConnection(result);

  if (!token || !endpoint) {
    return jsonError(logContext, 400, "token and endpoint are required");
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);

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
      };
    });

    // Enrich a bounded subset of non-internal collections so connect stays
    // responsive even when a keyspace contains many collections.
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
        } catch {
          // Leave count as null when the count query is unsupported or slow.
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
        } catch {
          // Field sampling is best-effort.
        }

        return [collectionName, { count, fields: Array.from(fieldSet) }];
      }
    );

    const metadataByCollection = new Map(sampledMetadata);
    for (const collection of collections) {
      const metadata = metadataByCollection.get(collection.name);
      if (!metadata) continue;
      collection.count = metadata.count;
      if (metadata.fields.length > 0) {
        fields[collection.name] = metadata.fields;
      }
    }

    return NextResponse.json(
      { collections, fields },
      { headers: { "X-Request-Id": logContext.requestId } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect";
    logError(logContext, "astra.connect.failed", err);
    return jsonError(logContext, 400, message);
  }
}
