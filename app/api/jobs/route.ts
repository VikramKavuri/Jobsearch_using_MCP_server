import { NextResponse } from "next/server";
import { runSearch, type SearchArgs } from "@/lib/service";
import { errorResponse, readJson } from "@/lib/api-helpers";

// jobs.search — rank the bundled (and optionally live) jobs against the query
// and profile, returning fit scores + match reasons.
export async function POST(req: Request) {
  try {
    const input = await readJson<SearchArgs>(req);
    const jobs = await runSearch(input);
    return NextResponse.json({ jobs, count: jobs.length });
  } catch (err) {
    return errorResponse(err);
  }
}
