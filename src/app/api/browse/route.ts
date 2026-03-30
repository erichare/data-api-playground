import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = await req.json() as {
    token?: string;
    endpoint?: string;
    keyspace?: string;
    collection: string;
    pageState?: string;
    sort?: { col: string; dir: 1 | -1 };
  };
  const { token, endpoint, keyspace } = resolveAstraConnection(body, { includeDefaultKeyspace: true });
  const { collection, pageState, sort } = body;

  if (!token || !endpoint || !collection) {
    return NextResponse.json({ error: "token, endpoint, and collection are required" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);
    const coll = db.collection(collection);

    const sortObj = sort ? { [sort.col]: sort.dir } : undefined;

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
