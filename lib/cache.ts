// A tiny cache abstraction with two backends:
//   - MemoryCache: in-process TTL map. Always available, zero config; survives
//     across requests on a warm serverless instance.
//   - KvCache: Vercel KV / Upstash Redis over its REST API (no SDK dependency).
//     Used automatically when KV_REST_API_URL + KV_REST_API_TOKEN are set, giving
//     a cache shared across all instances.
//
// Both degrade gracefully: a cache miss or backend error simply returns null /
// no-ops, so caching can never break a request.

export interface Cache {
  readonly backend: "memory" | "kv";
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

export class MemoryCache implements Cache {
  readonly backend = "memory" as const;
  private store = new Map<string, { value: unknown; expires: number }>();

  /** `now` is injectable so TTL expiry is unit-testable without real time. */
  constructor(private now: () => number = () => Date.now()) {}

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expires: this.now() + ttlSeconds * 1000 });
  }
}

class KvCache implements Cache {
  readonly backend = "kv" as const;
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async cmd(args: (string | number)[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`KV ${res.status}`);
    const data = (await res.json()) as { result?: unknown };
    return data.result ?? null;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.cmd(["GET", key]);
      return typeof raw === "string" ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.cmd(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
    } catch {
      /* best-effort: never fail the request over a cache write */
    }
  }
}

type Env = Record<string, string | undefined>;

/** Pick a backend from env: KV when configured, else in-memory. Pure — testable. */
export function createCache(env: Env): Cache {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new KvCache(url, token) : new MemoryCache();
}

let singleton: Cache | null = null;

/** App-wide cache, created once per instance from process.env. */
export function getCache(): Cache {
  if (!singleton) singleton = createCache(process.env);
  return singleton;
}

/** Stable, filesystem/redis-safe slug for cache keys. */
export function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "_"
  );
}
