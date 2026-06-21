import { NextResponse } from "next/server";
import { runSearch, type SearchArgs } from "@/lib/service";
import { errorResponse, readJson } from "@/lib/api-helpers";

// Live multi-source search validates each job link before returning, which can
// take a few seconds — allow up to the Hobby-plan ceiling.
export const maxDuration = 60;

// jobs.search — rank the bundled (and optionally live multi-source) jobs against
// the query and profile, returning fit scores, match reasons, source labels,
// and (for live search) only links that passed a reachability check.
export async function POST(req: Request) {
  try {
    const input = await readJson<SearchArgs>(req);
    const result = await runSearch(input);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
