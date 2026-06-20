import { NextResponse } from "next/server";
import { runQa } from "@/lib/service";
import { errorResponse, readJson } from "@/lib/api-helpers";
import type { QaInput } from "@/lib/tools/qa";

// qa.reply — heuristic (demo) or LLM (live) answer to an application question.
export async function POST(req: Request) {
  try {
    const input = await readJson<QaInput>(req);
    const result = await runQa(input);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
