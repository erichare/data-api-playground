import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { browseBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, browseBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint, keyspace } = resolveAstraConnection(result, { includeDefaultKeyspace: true });
  const { collection, pageState, sort } = result;

  if (!token || !endpoint || !collection) {
    return NextResponse.json({ error: "token, endpoint, and collection are required" }, { status: 400 });
  }

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cursor = coll.find({}, { limit: 20, sort: sortObj as any });
    if (pageState) {
      cursor = cursor.initialPageState(pageState);
    }

    const fetched = await cursor.fetchNextPage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const documents = fetched.result.map((doc: any) => {
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
    const message = err instanceof Error ? err.message : "Failed to fetch documents";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
