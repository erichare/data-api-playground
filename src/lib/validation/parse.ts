import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns the validated data on success, or a 400 NextResponse on failure.
 */
export async function parseJsonBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
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
