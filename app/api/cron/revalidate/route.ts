import { NextResponse } from "next/server";
import { warmCache } from "@/lib/service";

// Off-request-path cache warming. Schedule this (Vercel Cron, or any pinger) to
// keep the source + link caches warm so user searches stay sub-second. If
// CRON_SECRET is set, callers must send `Authorization: Bearer <CRON_SECRET>`
// (Vercel Cron does this automatically).
export const maxDuration = 60;

// A few popular default queries to keep hot.
const DEFAULT_QUERIES = [
  {},
  { query: "software engineer" },
  { query: "data engineer" },
  { query: "product manager" },
];

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await warmCache(DEFAULT_QUERIES);
  return NextResponse.json({ ok: true, ...result });
}
