import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import {
  DEFAULT_API_BODY_LIMIT_BYTES,
  INGEST_API_BODY_LIMIT_BYTES,
} from "@/lib/server/requestLimits";

interface BodyLimitOptions {
  maxBytes?: number;
  clone?: boolean;
}

function resolveBodyLimit(req: Pick<Request, "url">, maxBytes?: number) {
  if (typeof maxBytes === "number") return maxBytes;

  try {
    const { pathname } = new URL(req.url);
    return pathname.startsWith("/api/ingest")
      ? INGEST_API_BODY_LIMIT_BYTES
      : DEFAULT_API_BODY_LIMIT_BYTES;
  } catch {
    return DEFAULT_API_BODY_LIMIT_BYTES;
  }
}

function payloadTooLargeResponse() {
  return NextResponse.json(
    { error: "Payload too large" },
    { status: 413 }
  );
}

async function readTextBodyWithinLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<string | NextResponse> {
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      return payloadTooLargeResponse();
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

async function assertStreamWithinLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<NextResponse | null> {
  if (!body) return null;

  const reader = body.getReader();
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) return null;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      return payloadTooLargeResponse();
    }
  }
}

export async function assertRequestBodySize(
  req: Request,
  options: BodyLimitOptions = {}
): Promise<NextResponse | null> {
  const maxBytes = resolveBodyLimit(req, options.maxBytes);
  const request = options.clone ? req.clone() : req;
  return assertStreamWithinLimit(request.body, maxBytes);
}

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns the validated data on success, or a 400 NextResponse on failure.
 */
export async function parseJsonBody<T>(
  req: Request,
  schema: ZodSchema<T>,
  options: BodyLimitOptions = {}
): Promise<T | NextResponse> {
  const maxBytes = resolveBodyLimit(req, options.maxBytes);
  const text = await readTextBodyWithinLimit(req.body, maxBytes);
  if (text instanceof NextResponse) {
    return text;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  return result.data;
}

export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
