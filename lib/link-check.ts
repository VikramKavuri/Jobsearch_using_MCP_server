// Link validation: confirm a job's URL is reachable before we present it on the
// board. We are deliberately lenient — only a definitive "gone" signal (404/410)
// or a hard network failure drops a job. Auth walls, bot blocks (401/403), HEAD
// rejections (405), rate limits (429) and transient 5xx all mean "the page
// exists", so we keep them rather than discard real jobs over a false negative.

import type { Job } from "./types";
import type { Cache } from "./cache";

const CHECK_TIMEOUT_MS = 5000;
const MAX_CONCURRENCY = 8;
const UA = "job-search-mcp/1.0 (+https://job-search-mcp-tau.vercel.app)";

// Link-status cache TTLs: alive links rarely die, so cache them long; dead links
// get a shorter TTL so a re-posted/fixed URL gets re-checked sooner.
const LINK_ALIVE_TTL = 21_600; // 6h
const LINK_DEAD_TTL = 1_800; // 30m

export function linkCacheKey(url: string): string {
  return `link:v1:${url}`;
}

/** Pure decision: does this HTTP status mean the link is dead? */
export function isDeadStatus(status: number): boolean {
  return status === 404 || status === 410;
}

/** Probe a single URL. Returns true if it is reachable (or we can't prove it's
 * dead), false only on a definitive 404/410 or a non-timeout network failure. */
export async function checkUrlAlive(
  url: string,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false;

  const attempt = async (method: "HEAD" | "GET"): Promise<boolean | "retry"> => {
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Some servers reject HEAD with 405/501 — retry with GET before judging.
      if (method === "HEAD" && (res.status === 405 || res.status === 501)) {
        return "retry";
      }
      return !isDeadStatus(res.status);
    } catch (err) {
      // A timeout means "slow, not proven dead" → keep. Any other network
      // error on a GET means we couldn't reach it → treat as dead.
      const name = (err as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") return true;
      return method === "HEAD" ? "retry" : false;
    }
  };

  const head = await attempt("HEAD");
  if (head !== "retry") return head;
  const get = await attempt("GET");
  return get === "retry" ? true : get;
}

/** Validate many job links with bounded concurrency, preserving input order and
 * returning only the jobs whose links are reachable. */
export interface ValidateOptions {
  timeoutMs?: number;
  concurrency?: number;
  /** Optional link-status cache: skips the network for already-known URLs. */
  cache?: Cache;
  /** Injectable probe (defaults to a real network check) — keeps tests offline. */
  check?: (url: string) => Promise<boolean>;
}

/** Validate many job links with bounded concurrency, returning only the jobs
 * whose links are reachable. When a cache is supplied, known URLs are answered
 * from it (no network) and freshly-checked URLs are written back — so repeat
 * searches do zero link checks. */
export async function validateJobLinks<T extends Job>(
  jobs: T[],
  opts: ValidateOptions = {},
): Promise<T[]> {
  const timeoutMs = opts.timeoutMs ?? CHECK_TIMEOUT_MS;
  const concurrency = opts.concurrency ?? MAX_CONCURRENCY;
  const cache = opts.cache;
  const check = opts.check ?? ((url: string) => checkUrlAlive(url, timeoutMs));
  const alive = new Array<boolean>(jobs.length).fill(false);

  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const i = cursor++;
      const url = jobs[i].url;

      const cached = cache ? await cache.get<boolean>(linkCacheKey(url)) : null;
      if (cached !== null && cached !== undefined) {
        alive[i] = cached;
        continue;
      }

      const ok = await check(url);
      alive[i] = ok;
      if (cache) {
        await cache.set(linkCacheKey(url), ok, ok ? LINK_ALIVE_TTL : LINK_DEAD_TTL);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, worker),
  );

  return jobs.filter((_, i) => alive[i]);
}
