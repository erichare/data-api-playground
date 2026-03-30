import { NextRequest } from "next/server";
import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import { IamAuthenticator } from "ibm-cloud-sdk-core";
import { resolveAstraConnection } from "@/lib/astra";
import { requireApiAuth } from "@/lib/auth";
import { runChatWorkflow } from "@/lib/chat/service";
import type { ChatRequestPayload, StepEvent } from "@/lib/chat/types";
import { createRequestLogContext, logError } from "@/lib/server/log";

export const runtime = "nodejs";

const WATSONX_VERSION = "2024-05-31";

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/chat");
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const {
    token: bodyToken,
    endpoint: bodyEndpoint,
    ibmApiKey: bodyIbmApiKey,
    watsonxProjectId: bodyProjectId,
    ...payload
  } = (await req.json()) as ChatRequestPayload & {
    token?: string;
    endpoint?: string;
    ibmApiKey?: string;
    watsonxProjectId?: string;
  };

  const { token, endpoint } = resolveAstraConnection({
    token: bodyToken,
    endpoint: bodyEndpoint,
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
