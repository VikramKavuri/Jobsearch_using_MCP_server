import { describe, expect, test } from "vitest";
import { MemoryCache, createCache } from "./cache";

describe("MemoryCache", () => {
  test("stores and returns a value within its TTL", async () => {
    const c = new MemoryCache();
    await c.set("k", { hi: 1 }, 60);
    expect(await c.get<{ hi: number }>("k")).toEqual({ hi: 1 });
  });

  test("returns null for a missing key", async () => {
    const c = new MemoryCache();
    expect(await c.get("nope")).toBeNull();
  });

  test("expires entries once the TTL has elapsed", async () => {
    let now = 1_000_000;
    const c = new MemoryCache(() => now);
    await c.set("k", "v", 10); // expires at now + 10s
    expect(await c.get("k")).toBe("v");
    now += 11_000; // advance 11s
    expect(await c.get("k")).toBeNull();
  });

  test("reports the memory backend", () => {
    expect(new MemoryCache().backend).toBe("memory");
  });
});

describe("createCache", () => {
  test("uses the KV backend when KV_REST_API_URL + token are set", () => {
    const c = createCache({
      KV_REST_API_URL: "https://example.upstash.io",
      KV_REST_API_TOKEN: "tok",
    });
    expect(c.backend).toBe("kv");
  });

  test("falls back to in-memory when KV is not configured", () => {
    expect(createCache({}).backend).toBe("memory");
  });
});
