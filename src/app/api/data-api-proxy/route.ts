import { NextResponse } from "next/server";
import {
  getAstraDb,
  isAllowedAstraEndpoint,
  resolveAstraConnection,
} from "@/lib/astra";
import { requireApiAuth } from "@/lib/auth";

export async function POST(req: Request) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const body = await req.json() as {
    token?: string;
    endpoint?: string;
    keyspace?: string;
    collection: string;
    requestBody: Record<string, unknown>;
  };
  const { token, endpoint, keyspace } = resolveAstraConnection(body, {
    includeDefaultKeyspace: true,
  });
  const { collection, requestBody } = body;

  if (!token || !endpoint) {
    return NextResponse.json({ error: "Missing Astra DB token or endpoint" }, { status: 400 });
  }
  if (!collection) {
    return NextResponse.json({ error: "Missing collection name" }, { status: 400 });
  }
  if (!isAllowedAstraEndpoint(endpoint)) {
    return NextResponse.json(
      { error: "Endpoint must be a valid Astra DB API endpoint" },
      { status: 400 }
    );
  }

  const start = Date.now();

  try {
    const collectionRef = getAstraDb(token, endpoint, keyspace).collection(collection);
    const command = Object.entries(requestBody)[0];
    if (!command) {
      return NextResponse.json({ error: "Request body must contain an operation" }, { status: 400 });
    }

    const [operation, payload] = command as [string, unknown];
    let result: unknown;
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
        } as Parameters<typeof collectionRef.find>[1];
        result = await collectionRef.find(args.filter ?? {}, options).toArray();
        break;
      }
      case "findOne": {
        const args = (payload ?? {}) as {
          filter?: Record<string, unknown>;
          options?: Record<string, unknown>;
        };
        result = await collectionRef.findOne(args.filter ?? {}, args.options ?? {});
        break;
      }
      case "insertMany": {
        const args = (payload ?? {}) as { documents?: Record<string, unknown>[] };
        result = await collectionRef.insertMany(args.documents ?? []);
        break;
      }
      case "updateOne": {
        const args = (payload ?? {}) as {
          filter?: Record<string, unknown>;
          update?: Record<string, unknown>;
          options?: Record<string, unknown>;
        };
        result = await collectionRef.updateOne(
          args.filter ?? {},
          args.update ?? {},
          args.options ?? {}
        );
        break;
      }
      case "deleteOne": {
        const args = (payload ?? {}) as { filter?: Record<string, unknown> };
        result = await collectionRef.deleteOne(args.filter ?? {});
        break;
      }
      case "estimatedDocumentCount":
        result = await collectionRef.estimatedDocumentCount();
        break;
      default:
        return NextResponse.json({ error: `Unsupported operation: ${operation}` }, { status: 400 });
    }

    const latencyMs = Date.now() - start;
    return NextResponse.json({
      status: 200,
      statusText: "OK",
      latencyMs,
      data: result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 }
    );
  }
}
