import { NextRequest } from "next/server";
import { resolveBackend } from "@/lib/ai/service";
import { requireApiAuth } from "@/lib/auth";
import type { BackendConnectionInput } from "@/lib/backends/types";
import { runChatWorkflow } from "@/lib/chat/service";
import type { StepEvent } from "@/lib/chat/types";
import { withRequestLog } from "@/lib/astraClientLog";
import { createRequestLogContext, logError, sanitizeErrorForClient } from "@/lib/server/log";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { chatBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

const chatLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/chat");
  const authError = requireApiAuth(req);
  if (authError) return authError;

  const ip = getClientIp(req);
  const limit = chatLimiter.check(ip);
  if (limit.limited) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again later.", requestId: logContext.requestId }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          "X-Request-Id": logContext.requestId,
        },
      }
    );
  }
  const result = await parseJsonBody(req, chatBodySchema);
  if (isErrorResponse(result)) return result;

  const {
    backend: backendKind,
    token: bodyToken,
    endpoint: bodyEndpoint,
    username,
    password,
    isConnected,
    huggingfaceApiKey,
    keyspace,
    knowledgeBackend,
    openragApiKey,
    openragBaseUrl,
    ...payload
  } = result;
  const connection: BackendConnectionInput = {
    backend: backendKind,
    token: bodyToken,
    endpoint: bodyEndpoint,
    username,
    password,
    keyspace,
  } as BackendConnectionInput;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      await withRequestLog(async () => {
        const send = (event: StepEvent) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        const backend = resolveBackend({ huggingfaceApiKey });

        try {
          await runChatWorkflow({
            payload,
            connection,
            connectionActive: isConnected,
            ...(connection.backend === "hcd"
              ? {
                  username: connection.username ?? "",
                  password: connection.password ?? "",
                }
              : {
                  token: connection.token ?? "",
                }),
            endpoint: connection.endpoint ?? "",
            knowledgeBackend,
            openragApiKey,
            openragBaseUrl,
            backend,
            send,
          });
        } catch (err) {
          const message = sanitizeErrorForClient(err, "Unknown error");
          logError(logContext, "chat.workflow.failed", err, {
            activeCollection: payload.activeCollection,
            searchMode: payload.searchMode,
          });
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ error: message, requestId: logContext.requestId }) + "\n"
            )
          );
        } finally {
          controller.close();
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      "X-Request-Id": logContext.requestId,
    },
  });
}
