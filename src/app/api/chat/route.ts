import { NextRequest } from "next/server";
import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import { IamAuthenticator } from "ibm-cloud-sdk-core";
import { resolveAstraConnection } from "@/lib/astra";
import { requireApiAuth } from "@/lib/auth";
import { runChatWorkflow } from "@/lib/chat/service";
import type { StepEvent } from "@/lib/chat/types";
import { createRequestLogContext, logError } from "@/lib/server/log";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { chatBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

const WATSONX_VERSION = "2024-05-31";
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
    token: bodyToken,
    endpoint: bodyEndpoint,
    ibmApiKey: bodyIbmApiKey,
    watsonxProjectId: bodyProjectId,
    keyspace,
    ...payload
  } = result;

  const { token, endpoint } = resolveAstraConnection({
    token: bodyToken,
    endpoint: bodyEndpoint,
    keyspace,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StepEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      const ibmApiKey = bodyIbmApiKey || process.env.WATSONX_API_KEY;
      const projectId = bodyProjectId || process.env.WATSONX_PROJECT_ID;
      const watsonxUrl =
        process.env.WATSONX_URL || "https://wml-fvt.ml.test.cloud.ibm.com";
      const iamUrl = process.env.WATSONX_IAM_URL || "https://iam.test.cloud.ibm.com";
      const hfKey = process.env.HUGGINGFACE_API_KEY;
      const watsonx =
        ibmApiKey && projectId
          ? new WatsonXAI({
              version: WATSONX_VERSION,
              serviceUrl: watsonxUrl,
              authenticator: new IamAuthenticator({
                apikey: ibmApiKey,
                url: iamUrl,
              }),
            })
          : null;

      try {
        await runChatWorkflow({
          payload,
          token,
          endpoint,
          watsonx,
          projectId,
          hfKey,
          send,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
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
