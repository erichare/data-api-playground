import { NextRequest, NextResponse } from "next/server";
import { getAstraDb, resolveAstraConnection } from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
} from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { deleteDocumentsBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, deleteDocumentsBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint, keyspace } = resolveAstraConnection(result, { includeDefaultKeyspace: true });
  const { collection: collectionName, ids } = result;

  if (!token || !endpoint) {
    return NextResponse.json({ error: "token and endpoint are required" }, { status: 400 });
  }

  try {
    const db = getAstraDb(token, endpoint, keyspace);
    const coll = db.collection(collectionName);

    recordAstraClientCall({
      label: "Delete Documents",
      code: buildTsCall(`db.collection(${JSON.stringify(collectionName)})`, [
        formatTsMethodCall("deleteMany", [{ _id: { $in: ids } }]),
      ]),
    });
    const result = await coll.deleteMany({ _id: { $in: ids } });

    return NextResponse.json({ deletedCount: result.deletedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
