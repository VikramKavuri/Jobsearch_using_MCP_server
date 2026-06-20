import { NextResponse } from "next/server";
import { getStatus } from "@/lib/service";

// Reports demo vs. live mode so the UI can show the right banner.
export function GET() {
  return NextResponse.json(getStatus());
}
