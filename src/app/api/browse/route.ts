import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
  withRequestLog,
} from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { browseBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/browse");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, browseBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint, keyspace } = resolveAstraConnection(result, { includeDefaultKeyspace: true });
  const { collection, pageState, sort } = result;

  if (!token || !endpoint || !collection) {
    return NextResponse.json({ error: "token, endpoint, and collection are required" }, { status: 400 });
  }

  return withRequestLog(async () => {
    try {
      const db = getAstraDb(token, endpoint, keyspace);
      const coll = db.collection(collection);

      const sortObj = sort ? { [sort.col]: sort.dir } : undefined;
      const findOptions = {
        limit: 20,
        ...(sortObj ? { sort: sortObj } : {}),
      };
      const browseChain = [
        formatTsMethodCall("find", [{}, findOptions]),
        ...(pageState ? [formatTsMethodCall("initialPageState", [pageState])] : []),
        formatTsMethodCall("fetchNextPage", []),
      ];
      recordAstraClientCall({
        label: "Browse Collection",
        code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, browseChain),
      });

      // Sort key is user-provided so it can't satisfy the SDK's schema-parameterized sort type.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cursor = coll.find({}, { limit: 20, sort: sortObj as any });
      if (pageState) {
        cursor = cursor.initialPageState(pageState);
      }

      const fetched = await cursor.fetchNextPage();
      const documents = fetched.result.map((doc: Record<string, unknown>) => {
        if (doc.$vector && Array.isArray(doc.$vector)) {
          return { ...doc, $vector: `__vector_${(doc.$vector as number[]).length}__` };
        }
        return doc;
      });

      return NextResponse.json({
        documents,
        nextPageState: fetched.nextPageState ?? null,
      });
    } catch (err) {
      logError(logContext, "browse.failed", err, { collection });
      return NextResponse.json(
        { error: sanitizeErrorForClient(err, "Failed to fetch documents") },
        { status: 400 }
      );
    }
  });
}
