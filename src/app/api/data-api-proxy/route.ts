import { NextResponse } from "next/server";
import {
  getAstraDb,
  isAllowedAstraEndpoint,
  resolveAstraConnection,
} from "@/lib/astra";
import {
  buildTsCall,
  formatTsMethodCall,
  recordAstraClientCall,
  withRequestLog,
} from "@/lib/astraClientLog";
import { requireApiAuth } from "@/lib/auth";
import { createRequestLogContext, jsonError, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { dataApiProxyBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export async function POST(req: Request) {
  const logContext = createRequestLogContext(req, "/api/data-api-proxy");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const result = await parseJsonBody(req, dataApiProxyBodySchema);
  if (isErrorResponse(result)) return result;
  const { token, endpoint, keyspace } = resolveAstraConnection(result, {
    includeDefaultKeyspace: true,
  });
  const { collection, requestBody } = result;

  if (!token || !endpoint) {
    return jsonError(logContext, 400, "Missing Astra DB token or endpoint");
  }
  if (!collection) {
    return jsonError(logContext, 400, "Missing collection name");
  }
  if (!isAllowedAstraEndpoint(endpoint)) {
    return jsonError(logContext, 400, "Endpoint must be a valid Astra DB API endpoint");
  }

  return withRequestLog(async () => {
    const start = Date.now();

    try {
      const collectionRef = getAstraDb(token, endpoint, keyspace).collection(collection);
      const command = Object.entries(requestBody)[0];
      if (!command) {
        return jsonError(logContext, 400, "Request body must contain an operation");
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
          recordAstraClientCall({
            label: "API Explorer: Find",
            code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
              formatTsMethodCall("find", [args.filter ?? {}, options]),
              ".toArray()",
            ]),
          });
          result = await collectionRef.find(args.filter ?? {}, options).toArray();
          break;
        }
        case "findOne": {
          const args = (payload ?? {}) as {
            filter?: Record<string, unknown>;
            options?: Record<string, unknown>;
          };
          recordAstraClientCall({
            label: "API Explorer: Find One",
            code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
              formatTsMethodCall("findOne", [
                args.filter ?? {},
                args.options ?? {},
              ]),
            ]),
          });
          result = await collectionRef.findOne(args.filter ?? {}, args.options ?? {});
          break;
        }
        case "insertMany": {
          const args = (payload ?? {}) as { documents?: Record<string, unknown>[] };
          recordAstraClientCall({
            label: "API Explorer: Insert Many",
            code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
              formatTsMethodCall("insertMany", [args.documents ?? []]),
            ]),
          });
          result = await collectionRef.insertMany(args.documents ?? []);
          break;
        }
        case "updateOne": {
          const args = (payload ?? {}) as {
            filter?: Record<string, unknown>;
            update?: Record<string, unknown>;
            options?: Record<string, unknown>;
          };
          recordAstraClientCall({
            label: "API Explorer: Update One",
            code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
              formatTsMethodCall("updateOne", [
                args.filter ?? {},
                args.update ?? {},
                args.options ?? {},
              ]),
            ]),
          });
          result = await collectionRef.updateOne(
            args.filter ?? {},
            args.update ?? {},
            args.options ?? {}
          );
          break;
        }
        case "deleteOne": {
          const args = (payload ?? {}) as { filter?: Record<string, unknown> };
          recordAstraClientCall({
            label: "API Explorer: Delete One",
            code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
              formatTsMethodCall("deleteOne", [args.filter ?? {}]),
            ]),
          });
          result = await collectionRef.deleteOne(args.filter ?? {});
          break;
        }
        case "estimatedDocumentCount":
          recordAstraClientCall({
            label: "API Explorer: Estimated Count",
            code: buildTsCall(`db.collection(${JSON.stringify(collection)})`, [
              formatTsMethodCall("estimatedDocumentCount", []),
            ]),
          });
          result = await collectionRef.estimatedDocumentCount();
          break;
        default:
          return jsonError(logContext, 400, `Unsupported operation: ${operation}`);
      }

      const latencyMs = Date.now() - start;
      return NextResponse.json({
        status: 200,
        statusText: "OK",
        latencyMs,
        data: result,
        requestId: logContext.requestId,
      });
    } catch (err) {
      logError(logContext, "astra.proxy.failed", err, { collection });
      return jsonError(logContext, 500, sanitizeErrorForClient(err, "Request failed"));
    }
  });
}
