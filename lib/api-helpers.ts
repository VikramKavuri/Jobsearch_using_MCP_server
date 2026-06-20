import { NextResponse } from "next/server";
import { ProfileValidationError } from "./tools/profile";
import { QaValidationError } from "./tools/qa";

/** Map an error to a JSON response: validation errors → 400, everything
 * else → 500. Keeps every route's catch block a one-liner. */
export function errorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "Unknown error";
  const isValidation =
    err instanceof ProfileValidationError || err instanceof QaValidationError;
  return NextResponse.json(
    { error: message },
    { status: isValidation ? 400 : 500 },
  );
}

/** Parse a JSON request body, tolerating an empty body. */
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
