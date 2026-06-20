# Job Search MCP — Vercel Rebuild — Design Spec

**Date:** 2026-06-20
**Status:** Approved (pending written-spec review)
**Owner:** VikramKavuri

---

## 1. Background & problem

The source repo (`VikramKavuri/Jobsearch_using_MCP_server`) is a Gradio-based "Job
Search MCP Server" intended for Hugging Face Spaces. Two blocking facts make the
original un-runnable and un-deployable as requested:

1. **The core is missing.** `main.py` imports `src.tools`, `src.config`, and
   `src.services`, but no `src/` package exists in any branch or in git history.
   The app crashes on import (`ModuleNotFoundError: No module named 'src'`). Only
   the Gradio UI shell, a sample `job_search_results.json` (18 jobs), and
   dependency files remain.
2. **The stack cannot run on Vercel.** Gradio is a long-running websocket server;
   the dependency set (`torch`, `faiss-cpu`, `sentence-transformers`,
   `transformers`, `datasets`) is >2 GB installed. Vercel serverless functions cap
   at ~250 MB and are short-lived request/response. The project was built for HF
   Spaces, not Vercel.

**Goal:** a clean, easy-to-understand rebuild that **actually deploys and runs on
Vercel with zero secrets**, while remaining a genuine MCP server.

## 2. Decisions (locked)

- **Direction:** Lightweight Vercel rebuild (not a faithful HF Spaces port).
- **Stack:** Next.js (App Router) + TypeScript.
- **Test mode:** Zero-key demo by default; auto-upgrades to real AI when an API key
  is present as a Vercel env var. No secret is ever required to deploy or test.
- **Destination:** New local folder `d:\job-search-mcp`; on completion, replace the
  contents of the existing `VikramKavuri/Jobsearch_using_MCP_server` GitHub repo
  with the clean version (drop the Git LFS config — no large binaries remain).
- **Deploy:** Vercel CLI from this machine (requires `vercel login` or
  `VERCEL_TOKEN`).

## 3. Architecture

One Next.js deployable with three faces over a shared, pure-TypeScript core:

```
job-search-mcp/
├── app/
│   ├── page.tsx                      # Web UI: 4 tabs (Profile, Job Search, Cover Letter, Q&A)
│   ├── layout.tsx, globals.css       # Shell + styling
│   ├── api/
│   │   ├── profile/route.ts          # REST: profile upsert/get/delete
│   │   ├── jobs/route.ts             # REST: jobs.search (ranked, fit scores)
│   │   ├── letter/route.ts           # REST: letter.generate
│   │   └── qa/route.ts               # REST: qa.reply
│   └── api/mcp/[transport]/route.ts  # MCP endpoint (Streamable HTTP/SSE), 4 tools
├── lib/
│   ├── tools/
│   │   ├── profile.ts                # validate/normalize profile
│   │   ├── search.ts                 # rank jobs → fit % + match reasons
│   │   ├── letter.ts                 # cover-letter generation (template ↔ LLM)
│   │   ├── qa.ts                     # Q&A reply (heuristic ↔ LLM)
│   │   └── __tests__/                # deterministic unit tests
│   ├── ranking.ts                    # TF-IDF cosine over job text (pure TS)
│   ├── llm.ts                        # provider abstraction (OpenAI/Anthropic/HF ↔ demo)
│   ├── jobs-source.ts                # bundled sample + optional keyless Remotive fetch
│   ├── types.ts                      # shared domain types
│   └── config.ts                     # env detection → real-vs-demo switch
├── data/sample-jobs.json             # cleaned/deduped from the repo's 18-job sample
├── README.md  .env.example  package.json  tsconfig.json  next.config.ts
├── vercel.json (if needed)  .gitignore  vitest.config.ts
```

**Boundaries.** `lib/tools/*` and `lib/ranking.ts` are pure functions with no Next
or network dependencies — they are unit-testable in isolation. API routes and the
MCP handler are thin adapters that parse input, call a tool, and serialize output.
`lib/config.ts` is the only place that reads env and decides real-vs-demo, so the
tools never branch on environment themselves (they receive an injected
`llm`/`embedder`).

## 4. The four capabilities — demo vs. real

| Capability | Zero-key demo behavior | With API key |
|---|---|---|
| `profile.upsert` | Validate + normalize profile JSON; return normalized profile. Server is **stateless** (no durable store assumed on serverless); the UI persists to `localStorage` and passes profile inline to later calls. Optional Vercel KV if `KV_*` env is set. | same |
| `jobs.search` | Rank bundled jobs (+ optional keyless Remotive live fetch) by **TF-IDF cosine** of job text vs `query + profile`; return ranked jobs with `fit_score` (%) and `match_reasons`. | swap in real embeddings if an embeddings key is configured |
| `letter.generate` | Fill a structured **template** from profile + job in the requested tone (professional/casual/enthusiastic/formal). | real **LLM-generated** letter via `lib/llm.ts` |
| `qa.reply` | Heuristic answer assembled from profile + question + optional context. | real **LLM-generated** answer |

All four are exposed three ways: web UI → REST API routes → same `lib/tools`
functions; and independently as **MCP tools** at `/api/mcp`.

## 5. Real-vs-demo switch

`lib/config.ts` reads env once:

- `LLM_PROVIDER` (`auto` default) + `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` /
  `HF_TOKEN`. If a usable key exists → real LLM mode; else → deterministic demo
  templates.
- Embeddings: if a real embeddings key is configured, `jobs.search` uses it;
  otherwise pure-TS TF-IDF. Demo ranking is always available so search never fails.
- `MAX_TOKENS`, `TEMPERATURE`, `LLM_MODEL` have safe defaults.

The demo path is fully deterministic so unit tests and the live demo are stable
without network access.

## 6. MCP endpoint

`app/api/mcp/[transport]/route.ts` uses Vercel's MCP adapter (`mcp-handler` /
`@vercel/mcp-adapter`) to expose `profile_upsert`, `jobs_search`,
`letter_generate`, and `qa_reply` as MCP tools over Streamable HTTP (with SSE
fallback). Each tool has a Zod input schema and calls the same `lib/tools`
function as the REST route. This preserves the project's identity: it is connectable
from Claude Desktop / Cursor / any MCP client, and the README documents the connect
config.

## 7. Web UI

Single page, four tabs mirroring the original Gradio app: Profile, Job Search,
Cover Letter, Q&A. Clean, labeled, responsive; a small banner shows whether the app
is in **Demo mode** or **Live AI mode** based on `/api/config`. The UI is what we
visually smoke-test in a headless browser.

## 8. Testing & verification

1. **Unit tests (Vitest):** ranking determinism + ordering, fit-score bounds,
   template rendering for each tone, profile validation. Pure functions, no network.
2. **Local run:** `npm run dev`, drive the 4 tabs in a headless browser, confirm
   each returns sensible output in demo mode.
3. **Deploy:** `vercel` (preview) then `vercel --prod`; smoke-test the live URL and
   `POST` the MCP endpoint to confirm tool discovery.

## 9. Repo hygiene & handoff

- Honest, inverted-pyramid README: what it is, live demo link, how it works
  (demo vs. live AI), how to run locally, how to deploy to Vercel, how to connect as
  an MCP server, and an explicit note that this is a clean Vercel rebuild of the
  original HF-Spaces concept.
- `.env.example` documents every optional key.
- Replace existing repo contents; remove Git LFS `.gitattributes` (no large files).
- Conventional, meaningful commits.

## 10. Out of scope (YAGNI)

- No local GPU embeddings / torch / faiss / Gradio.
- No durable multi-user database (stateless + optional KV only).
- No real authentication; no scraping beyond the keyless Remotive API.
- No HF Spaces deployment.

## 11. Risks & mitigations

- **MCP adapter API drift:** pin the adapter version; keep the handler thin so a
  swap is cheap. Mitigation: the REST routes are independent, so the demo/UI works
  even if the MCP transport needs adjustment.
- **Vercel CLI auth:** requires user `vercel login` / `VERCEL_TOKEN` — flagged as
  the one step needing the user.
- **Sample-data duplicates:** the source JSON has repeated rows; dedupe and lightly
  diversify when building `data/sample-jobs.json` so ranking shows variety.
