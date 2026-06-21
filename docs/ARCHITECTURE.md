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
  │    │     └─ Promise.all([ Remotive, The Muse, Arbeitnow, RemoteOK, Jobicy ])
  │    │           each: fetch → map → graceful [] on failure
  │    │     └─ dedupeJobs(...)                    ← by id, then title+company
  │    ├─ searchJobs(...)                          ← TF-IDF cosine + token location filter
  │    │     └─ fit_score (0–100) + match_reasons
  │    └─ validateJobLinks(top N)                  ← HEAD/GET, drop only 404/410/hard-fail
  │
  └─ { jobs, count, sources, validated }
```

Key property: **one slow or dead source never breaks search.** Each fetch resolves
to `[]` on any error; if every live source fails, the bundled sample is the
fallback so the board is never empty.

## Design decisions & trade-offs

| Decision | Why | Trade-off |
|---|---|---|
| **TF-IDF cosine**, pure TS | Deterministic, zero-dependency, runs on serverless with no model to load; makes tests reproducible offline | Lexical, not semantic — "ML engineer" won't match "machine-learning" by meaning. Semantic embeddings are the documented upgrade path. |
| **Stateless** (profile in `localStorage`) | No DB to provision; trivially horizontally scalable; no PII at rest | No cross-device sync, no server-side history |
| **Demo-by-default**, key-optional | Anyone can run/deploy/test with zero secrets; auto-upgrades to live AI | Two code paths to keep coherent (handled by the injected `Llm` + tests on both) |
| **Validate links per request** | Honest boards — never show a dead posting | Adds 3–8s latency and N outbound requests; no caching yet |
| **Lenient link validation** (drop only 404/410/hard-fail) | Bot walls return 401/403/405 on real pages; being strict would drop good jobs | A page that 500s permanently could slip through |

## What would change to run this at scale

This is a demo. To make it a production system serving real traffic, the honest
list of next steps:

1. **Cache the source fetches** (Redis/Vercel KV, ~10-min TTL keyed by role+location)
   instead of hitting five APIs on every request.
2. **Cache link-validation results** and move validation off the request path (a
   background job that marks links stale), so search stays sub-second.
3. **Swap TF-IDF for embeddings** (e.g. a vector store) for semantic matching, with
   the lexical path as a cheap fallback.
4. **Persistence + auth** for saved profiles, search history, and application tracking.
5. **Observability**: structured logs, per-source success metrics, p95 latency, and
   alerting on source outages.
6. **Resilience**: per-source circuit breakers and rate limiting; pagination across
   sources rather than a fixed `limit` each.

The current boundaries make every one of these a localized change: caching and
embeddings live behind `lib/jobs-source.ts` / `lib/ranking.ts`; persistence slots in
at `lib/service.ts`; none of it touches the pure tools or the three adapters.

## Testing

68 unit tests (Vitest) cover the pure surface: ranking determinism and bounds,
config's env→provider decision, all four tools (demo and injected-LLM paths via a
fake `Llm`), the five source mappers, the location filter, and dead-link
classification. Network code is verified against the live APIs rather than mocked.
CI runs typecheck → tests → build on every push.
