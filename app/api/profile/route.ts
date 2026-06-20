import { NextResponse } from "next/server";
import { runProfile } from "@/lib/service";
import { errorResponse, readJson } from "@/lib/api-helpers";
import type { ProfileInput } from "@/lib/tools/profile";

// profile.upsert — validate + normalize. Stateless: returns the normalized
// profile for the client to persist and pass back inline on later calls.
export async function POST(req: Request) {
  try {
    const input = await readJson<ProfileInput>(req);
    const profile = runProfile(input);
    return NextResponse.json({ profile });
  } catch (err) {
    return errorResponse(err);
  }
}
