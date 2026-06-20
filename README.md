# Job Search MCP

A job-search assistant that runs as **a web app and a connectable MCP server** — and
deploys to Vercel with **zero API keys**. It ranks roles against your profile,
drafts cover letters, and rehearses answers to application questions.

By default everything runs in a deterministic **demo mode** (pure TypeScript, no
secrets, no network). Add a single API key and it auto-upgrades to **live AI**.

> This is a clean Vercel rebuild of the original Hugging Face Spaces "Job Search
> MCP Server" concept. The original was a Gradio app with a >2 GB
> torch/faiss/transformers stack that cannot run on Vercel's serverless
> functions, and its `src/` core was missing from git history. This rebuild keeps
> the idea — four job-search capabilities exposed over MCP — on a lightweight,
> deployable stack.

## The four capabilities

| Capability | Demo mode (no key) | Live mode (with key) |
|---|---|---|
| **Profile** | Validate + normalize a profile (skills, experience, etc.) | same |
| **Job search** | Rank jobs by **TF-IDF cosine** vs. your query + profile; returns a `fit_score` (0–100) and `match_reasons` | swap in real embeddings if configured |
| **Cover letter** | Fill a tone-aware **template** (professional / casual / enthusiastic / formal) | **LLM-written** letter |
| **Q&A** | Heuristic answer assembled from your profile | **LLM-written** answer |

All four are reachable three ways: the **web UI**, the **REST API**, and as **MCP
tools** — all backed by the same pure functions in `lib/`.

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 52 unit tests (pure functions, no network)
```

No `.env` needed — it starts in demo mode. To try live AI, copy `.env.example`
to `.env.local` and set one key (e.g. `ANTHROPIC_API_KEY`).

## Deploy to Vercel

```bash
npm i -g vercel
vercel               # preview deploy (prompts for login the first time)
vercel --prod        # production deploy
```

Vercel auto-detects Next.js — no extra config. To enable live AI on the
deployment, add an API key under **Project → Settings → Environment Variables**
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `HF_TOKEN`) and redeploy. The banner in
the UI shows whether you're in **Demo** or **Live AI** mode.

## Connect as an MCP server

The MCP endpoint is at **`/api/mcp`** (Streamable HTTP, with SSE fallback). Point
any MCP client at `https://<your-deployment>/api/mcp`.

**Claude Desktop / Cursor** (`claude_desktop_config.json` / MCP settings):

```json
{
  "mcpServers": {
    "job-search": {
      "url": "https://<your-deployment>/api/mcp"
    }
  }
}
```

Tools exposed: `profile_upsert`, `jobs_search`, `letter_generate`, `qa_reply`.

Quick check against a running server:

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## REST API

| Method & path | Body | Returns |
|---|---|---|
| `GET /api/config` | — | `{ mode, provider, model, liveAiEnabled }` |
| `POST /api/profile` | profile fields | `{ profile }` (normalized) |
| `POST /api/jobs` | `{ query, profile, limit?, remoteOnly?, location?, live? }` | `{ jobs, count }` |
| `POST /api/letter` | `{ profile, job:{title,company}, tone? }` | `{ text, tone, mode }` |
| `POST /api/qa` | `{ question, profile, context? }` | `{ answer, mode }` |

Set `live: true` on `/api/jobs` to also pull keyless live listings from the
Remotive API (falls back to the bundled sample on any failure).

## How it works

```
app/
  page.tsx                     Web UI: 4 tabs (Profile, Job Search, Cover Letter, Q&A)
  api/{config,profile,jobs,letter,qa}/route.ts   thin REST adapters
  api/[transport]/route.ts     MCP endpoint (4 tools) at /api/mcp
lib/
  tools/{profile,search,letter,qa}.ts   pure capability functions (+ unit tests)
  ranking.ts                   TF-IDF cosine over job text (pure TS)
  config.ts                    env → real-vs-demo decision (the only env reader)
  llm.ts                       provider abstraction (OpenAI / Anthropic / HF ↔ demo)
  jobs-source.ts               bundled sample + optional keyless live fetch
  service.ts                   composition root used by both REST and MCP
data/sample-jobs.json          16 deduped, diverse sample roles
```

The capability functions in `lib/tools/*` and `lib/ranking.ts` are **pure** — no
Next, no env, no network — so they're unit-tested in isolation. `lib/config.ts` is
the single place that reads env and decides demo-vs-live; tools receive an injected
`llm` and never branch on environment themselves. That's why the REST API and the
MCP server can never drift: they call the same `lib/service.ts` functions.

The server is **stateless** (serverless-friendly): your profile is saved to the
browser's `localStorage` and passed inline to each call — no database required.

## Notes / out of scope

- No torch / faiss / Gradio / GPU. Ranking is pure-TS TF-IDF; "real embeddings" is
  a documented upgrade path, not a hard dependency.
- No durable multi-user database (stateless by design).
- No scraping beyond the keyless Remotive API.
