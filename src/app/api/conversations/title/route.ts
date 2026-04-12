import { NextRequest, NextResponse } from "next/server";
import { generateText, resolveBackend } from "@/lib/ai/service";
import { requireApiAuth } from "@/lib/auth";
import { createRequestLogContext, logError } from "@/lib/server/log";
import { conversationTitleBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody, isErrorResponse } from "@/lib/validation/parse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const logContext = createRequestLogContext(req, "/api/conversations/title");
  const authError = requireApiAuth(req);
  if (authError) return authError;

  const result = await parseJsonBody(req, conversationTitleBodySchema);
  if (isErrorResponse(result)) return result;

  const { firstMessage, huggingfaceApiKey } = result;
  const backend = resolveBackend({ huggingfaceApiKey });

  try {
    const response = await generateText({
      backend,
      allowPull: false,
      maxTokens: 20,
      messages: [
        {
          role: "user",
          content: `Generate a short conversation title (3-6 words, no quotes) for a chat that starts with this message: "${firstMessage.slice(0, 300)}"`,
        },
      ],
    });

    const title =
      response.content.trim().replace(/^["']|["']$/g, "").slice(0, 60) || null;
    return NextResponse.json({ title });
  } catch (err) {
    logError(logContext, "conversations.title.failed", err);
    return NextResponse.json({ title: null });
  }
}
