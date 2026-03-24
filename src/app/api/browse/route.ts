import { NextRequest, NextResponse } from "next/server";
import { DataAPIClient } from "@datastax/astra-db-ts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { token, endpoint, collection, pageState, sort } = await req.json() as {
    token: string;
    endpoint: string;
    collection: string;
    pageState?: string;
    sort?: { col: string; dir: 1 | -1 };
  };

  if (!token || !endpoint || !collection) {
    return NextResponse.json({ error: "token, endpoint, and collection are required" }, { status: 400 });
  }

  try {
    const client = new DataAPIClient(token);
    const db = client.db(endpoint);
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
