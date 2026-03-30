import { NextRequest, NextResponse } from "next/server";
import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import { IamAuthenticator } from "ibm-cloud-sdk-core";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

const WATSONX_VERSION = "2024-05-31";
const GRANITE_CHAT_MODEL = "ibm/granite-3-8b-instruct";

export async function POST(req: NextRequest) {
  const authError = requireApiAuth(req);
  if (authError) return authError;
  const { firstMessage, ibmApiKey: bodyKey, watsonxProjectId: bodyProject } = await req.json() as {
    firstMessage: string;
    ibmApiKey?: string;
    watsonxProjectId?: string;
  };

  const ibmApiKey = bodyKey || process.env.WATSONX_API_KEY;
  const projectId = bodyProject || process.env.WATSONX_PROJECT_ID;

  if (!ibmApiKey || !projectId) {
    return NextResponse.json({ title: null });
  }

  try {
    const client = WatsonXAI.newInstance({
      version: WATSONX_VERSION,
      serviceUrl: "https://us-south.ml.cloud.ibm.com",
      authenticator: new IamAuthenticator({ apikey: ibmApiKey }),
    });

    const result = await client.textChat({
      modelId: GRANITE_CHAT_MODEL,
      projectId,
      messages: [
        {
          role: "user",
          content: `Generate a short conversation title (3-6 words, no quotes) for a chat that starts with this message: "${firstMessage.slice(0, 300)}"`,
        },
      ],
      maxTokens: 20,
    });

    const raw = (result.result.choices?.[0]?.message?.content as string | undefined) ?? "";
    const title = raw.trim().replace(/^["']|["']$/g, "").slice(0, 60) || null;
    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: null });
  }
}
