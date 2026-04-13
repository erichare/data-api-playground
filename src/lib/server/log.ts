import { NextResponse } from "next/server";

/**
 * Structured JSON logging utilities for API route handlers.
 *
 * Every request gets a unique ID via `createRequestLogContext`, which is
 * included in all log entries and error responses for traceability.
 */

/** Context attached to every log entry and error response for a single request. */
export interface RequestLogContext {
  requestId: string;
  route: string;
  method: string;
}

/** Initialize a request context with a unique ID for structured logging. */
export function createRequestLogContext(req: Pick<Request, "method">, route: string): RequestLogContext {
  return {
    requestId: crypto.randomUUID(),
    route,
    method: req.method,
  };
}

/** Emit an info-level structured JSON log entry. */
export function logInfo(context: RequestLogContext, event: string, details?: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      level: "info",
      event,
      requestId: context.requestId,
      route: context.route,
      method: context.method,
      ...details,
    })
  );
}

/** Emit an error-level structured JSON log entry with stack trace when available. */
export function logError(
  context: RequestLogContext,
  event: string,
  error: unknown,
  details?: Record<string, unknown>
) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      level: "error",
      event,
      requestId: context.requestId,
      route: context.route,
      method: context.method,
      error: message,
      ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      ...details,
    })
  );
}

const SENSITIVE_TOKEN_PATTERNS = [
  /AstraCS:[^\s,;)}\]'"]+/g,
  /Bearer\s+[^\s,;)}\]'"]+/g,
  /hf_[a-zA-Z0-9]+/g,
];

/**
 * Extract an error message safe for client responses.
 * Strips credential-like patterns (AstraCS tokens, Bearer tokens, HF keys)
 * and truncates to 500 characters.
 */
export function sanitizeErrorForClient(err: unknown, fallback: string): string {
  let message = err instanceof Error ? err.message : fallback;
  for (const pattern of SENSITIVE_TOKEN_PATTERNS) {
    message = message.replace(pattern, "[REDACTED]");
  }
  return message.slice(0, 500);
}

/** Return a JSON error response with the request ID in both the body and headers. */
export function jsonError(
  context: RequestLogContext,
  status: number,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: message,
      requestId: context.requestId,
      ...extra,
    },
    {
      status,
      headers: {
        "X-Request-Id": context.requestId,
      },
    }
  );
}
