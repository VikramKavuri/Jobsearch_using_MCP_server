# Architecture

A short tour of how the system is put together, why it's built this way, and —
honestly — what would have to change to run it at scale.

## One core, three faces

The product is exposed three ways, but there is exactly **one** implementation of
each capability. The web UI, the REST API, and the MCP server are all thin
adapters over the same pure functions.

```
                 ┌───────────────┐
   Web UI ─────► │               │
   REST API ───► │  lib/service  │ ──► pure tools (lib/tools/*) ──► lib/ranking
   MCP server ─► │ (composition) │ ──► lib/jobs-source ──► 5 live APIs + sample
                 └───────────────┘ ──► lib/llm ──► Groq / OpenAI / Anthropic / HF
                         ▲
                         └── lib/config (the only reader of env: demo vs. live)
```

- **`lib/tools/{profile,search,letter,qa}.ts`** and **`lib/ranking.ts`** are pure:
  no Next, no env, no network. They take data in and return data out, so they are
  unit-tested in isolation (this is most of the 68 tests).
- **`lib/config.ts`** is the *single* place that reads environment variables and
  decides demo-vs-live and which LLM provider to use. Tools never branch on the
  environment; they receive an injected `Llm`.
- **`lib/service.ts`** is the composition root. Both `app/api/*/route.ts` (REST)
  and `app/api/[transport]/route.ts` (MCP) call it, which is why the two surfaces
  can never drift in behavior.

## Data flow: a live job search

```
POST /api/jobs { query, profile, location, live: true }
  │
  ├─ lib/service.runSearch
  │    ├─ role  = query || profile.title          ← profile-driven filters
  │    ├─ getJobs({ live, query: role, location })
  │    │     ├─ cache.get(jobs:role:location)      ← HIT → return cached, 0 calls
  │    │     └─ MISS: Promise.all([ Remotive, The Muse, Arbeitnow, RemoteOK, Jobicy ])
  │    │           each: fetch → map → graceful [] on failure
  │    │           → dedupeJobs(...) → cache.set(TTL 10m)
  │    ├─ searchJobs(...)                          ← TF-IDF cosine + token location filter
  │    │     └─ fit_score (0–100) + match_reasons
  │    └─ validateJobLinks(top N, cache)           ← cached status, else HEAD/GET;
  │                                                   drop only 404/410/hard-fail
  │
  └─ { jobs, count, sources, validated }
```

Key property: **one slow or dead source never breaks search.** Each fetch resolves
to `[]` on any error; if every live source fails, the bundled sample is the
fallback so the board is never empty.

**Caching.** The merged source results and each link's reachability are cached
(`lib/cache.ts`). A cold search (first time for a query) fetches + validates and
populates both caches; a warm search reuses them and does **zero** outbound calls.
Measured: **~3.7s cold → ~0.08s warm** (≈45× faster), same results. The cache is
in-process by default and upgrades to Vercel KV / Upstash when `KV_REST_API_URL` +
`KV_REST_API_TOKEN` are set, sharing state across instances. `/api/cron/revalidate`
warms popular queries off the request path.

## Design decisions & trade-offs

| Decision | Why | Trade-off |
|---|---|---|
| **TF-IDF cosine**, pure TS | Deterministic, zero-dependency, runs on serverless with no model to load; makes tests reproducible offline | Lexical, not semantic — "ML engineer" won't match "machine-learning" by meaning. Semantic embeddings are the documented upgrade path. |
| **Stateless** (profile in `localStorage`) | No DB to provision; trivially horizontally scalable; no PII at rest | No cross-device sync, no server-side history |
| **Demo-by-default**, key-optional | Anyone can run/deploy/test with zero secrets; auto-upgrades to live AI | Two code paths to keep coherent (handled by the injected `Llm` + tests on both) |
| **Validate links, then cache** | Honest boards — never show a dead posting — without paying for it twice | Cold search still pays the validation cost (~3–4s); warm searches reuse cached status |
| **Lenient link validation** (drop only 404/410/hard-fail) | Bot walls return 401/403/405 on real pages; being strict would drop good jobs | A page that 500s permanently could slip through |

## Scaling: done vs. next

**Implemented**

- **Cache the source fetches** — Vercel KV / in-memory, 10-min TTL keyed by
  role+location, so repeat searches skip the five APIs (`lib/cache.ts`,
  `getJobs`).
- **Cache link-validation** — each URL's reachability is validated once and reused;
  warm searches do zero link checks (`validateJobLinks` + cache). A cron endpoint
  (`/api/cron/revalidate`) warms popular queries off the request path.

**Still to do**

- **Swap TF-IDF for embeddings** (a vector store) for semantic matching, with the
  lexical path as a cheap fallback.
- **Persistence + auth** for saved profiles, search history, and application tracking.
- **Observability**: structured logs, per-source success metrics, p95 latency, and
  alerting on source outages.
- **Resilience**: per-source circuit breakers and rate limiting; pagination across
  sources rather than a fixed `limit` each; a real queue (SQS/Cloud Tasks) for
  validation instead of `waitUntil`-style background work.

The boundaries make each of these a localized change: caching and embeddings live
behind `lib/jobs-source.ts` / `lib/ranking.ts`; persistence slots in at
`lib/service.ts`; none of it touches the pure tools or the three adapters.

## Testing

77 unit tests (Vitest) cover the pure surface: ranking determinism and bounds,
config's env→provider decision, all four tools (demo and injected-LLM paths via a
fake `Llm`), the five source mappers, the location filter, dead-link classification,
the cache (TTL expiry, backend selection), and the link-status cache (hit/miss/write
via an injected checker — no network). Live network paths are verified against the
real APIs rather than mocked. CI runs typecheck → tests → build on every push.
