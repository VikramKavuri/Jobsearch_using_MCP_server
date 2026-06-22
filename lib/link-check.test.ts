import { describe, expect, test, vi } from "vitest";
import { isDeadStatus, validateJobLinks, linkCacheKey } from "./link-check";
import { MemoryCache } from "./cache";
import type { Job } from "./types";

const job = (id: string, url: string): Job => ({
  id,
  title: "T",
  company: "C",
  location: "Remote",
  remote: true,
  type: "Full-time",
  tags: [],
  description: "",
  url,
});

describe("isDeadStatus", () => {
  test("treats 404 and 410 as dead", () => {
    expect(isDeadStatus(404)).toBe(true);
    expect(isDeadStatus(410)).toBe(true);
  });

  test("treats 2xx / 3xx as alive", () => {
    for (const s of [200, 201, 204, 301, 302, 307, 308]) {
      expect(isDeadStatus(s)).toBe(false);
    }
  });

  test("treats gated/blocked/transient codes as alive (the page exists)", () => {
    // 401/403 = auth/bot wall, 405 = HEAD not allowed, 429 = rate limit,
    // 5xx = transient. None of these mean the link is dead.
    for (const s of [401, 403, 405, 429, 500, 503]) {
      expect(isDeadStatus(s)).toBe(false);
    }
  });
});

describe("validateJobLinks (with cache, injected checker)", () => {
  test("drops links the checker reports dead, keeps the rest", async () => {
    const check = vi.fn(async (url: string) => !url.includes("dead"));
    const out = await validateJobLinks(
      [job("1", "https://x/ok"), job("2", "https://x/dead"), job("3", "https://x/ok2")],
      { check },
    );
    expect(out.map((j) => j.id)).toEqual(["1", "3"]);
  });

  test("answers known URLs from cache without calling the checker", async () => {
    const cache = new MemoryCache();
    await cache.set(linkCacheKey("https://x/known-alive"), true, 60);
    await cache.set(linkCacheKey("https://x/known-dead"), false, 60);
    const check = vi.fn(async () => true);

    const out = await validateJobLinks(
      [job("a", "https://x/known-alive"), job("b", "https://x/known-dead")],
      { cache, check },
    );

    expect(out.map((j) => j.id)).toEqual(["a"]); // dead one dropped from cache
    expect(check).not.toHaveBeenCalled(); // no network for cached URLs
  });

  test("caches freshly-checked results for next time", async () => {
    const cache = new MemoryCache();
    const check = vi.fn(async () => true);

    await validateJobLinks([job("1", "https://x/fresh")], { cache, check });
    expect(check).toHaveBeenCalledTimes(1);

    // second pass: served from cache, checker not called again
    await validateJobLinks([job("1", "https://x/fresh")], { cache, check });
    expect(check).toHaveBeenCalledTimes(1);
    expect(await cache.get<boolean>(linkCacheKey("https://x/fresh"))).toBe(true);
  });
});
