import { NextResponse } from "next/server";
import { runLetter } from "@/lib/service";
import { errorResponse, readJson } from "@/lib/api-helpers";
import type { LetterInput } from "@/lib/tools/letter";

// letter.generate — template (demo) or LLM (live) cover letter.
export async function POST(req: Request) {
  try {
    const input = await readJson<LetterInput>(req);
    if (!input.job?.title || !input.job?.company) {
      return NextResponse.json(
        { error: "A job with a title and company is required." },
        { status: 400 },
      );
    }
    const result = await runLetter(input);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
