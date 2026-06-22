<h1 align="center">Job Search Dossier</h1>

<p align="center">
  I built Job Search Dossier to take the grind out of a job hunt: it ranks roles for you,
  drafts your cover letters, and helps you rehearse application answers —<br/>
  all available as a <strong>web app</strong>, a <strong>REST API</strong>, and a connectable <strong>MCP server</strong>.
  It runs with <strong>zero API keys</strong> by default, and pulls real jobs from five public sources when you want them.
</p>

<p align="center">
  <a href="https://job-search-mcp-tau.vercel.app">
    <img alt="Live Demo" src="https://img.shields.io/badge/▶_Live_Demo-job--search--mcp--tau.vercel.app-0b6e4f?style=for-the-badge&labelColor=0b0b0c">
  </a>
  <a href="https://github.com/VikramKavuri/Jobsearch_using_MCP_server/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/VikramKavuri/Jobsearch_using_MCP_server/actions/workflows/ci.yml/badge.svg">
  </a>
  <img alt="Tests" src="https://img.shields.io/badge/tests-77_passing-9c7a14?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-0b0b0c?style=flat-square">
</p>

> **▶ Try it now:** **https://job-search-mcp-tau.vercel.app**
> No sign-up, no keys. Fill in a profile, search jobs, generate a cover letter, and rehearse a Q&A.

---

## Where I pull the jobs from

When you tick **"Include live listings"**, I fetch from **five keyless sources in parallel**,
filter them by your profile's role and location, then merge, de-duplicate, rank, and
**check that every link is actually reachable before I show it to you**.

<p align="center">
  <img src="docs/assets/sources.svg" alt="Jobs are pulled from Remotive, The Muse, Arbeitnow, RemoteOK and Jobicy, then ranked and link-checked" width="100%">
</p>

| Source | Coverage | How I filter it |
|---|---|---|
| **Remotive** | Remote roles | keyword search |
| **The Muse** | Remote **and on-site** | location |
| **Arbeitnow** | EU + remote | ranking |
| **RemoteOK** | Remote roles | role tag |
| **Jobicy** | Remote roles | region + role tag |

If you leave live listings off, search runs instantly over a bundled, illustrative sample dataset.

## The profile you give me

Everything keys off a simple candidate profile. I keep it **only in your browser**
(`localStorage`) and pass it inline to each call, so the server stays stateless — your data
never sits on my backend.

<p align="center">
  <img src="docs/assets/profile.svg" alt="Profile fields: full name, title, summary, skills, years of experience, location, education and optional email" width="100%">
</p>

| Field | What I use it for |
|---|---|
| **Full name** | cover letters, Q&A voice |
| **Desired / current title** | job ranking + role filter |
| **Professional summary** | ranking, letters, Q&A |
| **Skills** | ranking, `fit_score`, match reasons |
| **Years of experience** | letters, Q&A |
| **Location** | location filter across sources |
| **Education** | Q&A answers |
| **Email** *(optional)* | validated if you provide it |

## What you can do — demo vs. live

| Capability | Zero-key demo | With an API key |
|---|---|---|
| **Profile** | I validate + normalize your profile | same |
| **Job search** | I rank by **TF-IDF cosine** → `fit_score` (0–100) + `match_reasons` | + live multi-source listings |
| **Cover letter** | I fill a tone-aware **template** (professional / casual / enthusiastic / formal) | **LLM-written** letter |
| **Q&A** | Heuristic answer built from your profile | **LLM-written** answer |

The live deployment runs in **Live AI mode** through [Groq](https://console.groq.com)
(`llama-3.3-70b-versatile`), so letters and answers are model-generated. The banner in the
UI tells you whether you're in **Demo** or **Live AI** mode.

## Performance — how I keep live search fast

Hitting five APIs and validating ~20 links on every request is slow (~3–4s) and abuses the
sources. So I cache two things: the **merged source results** (keyed by role + location,
10-minute TTL) and each **link's reachability** (validated once, then reused). A repeat
search does **zero outbound calls** and returns the same results almost instantly.

Measured locally, same query, same results:

| | Cold (first search, fills the cache) | Warm (repeat within 10 min) |
|---|---|---|
| Live search latency | **~3.7 s** | **~0.08 s** |
| Outbound calls | ~25 | **0** |

That's roughly a **45× speed-up** on the warm path — and I keep correctness, so I never serve
a link I haven't verified. To stop users ever paying the cold cost, there's an off-request-path
warm-up endpoint, **`/api/cron/revalidate`**, you can put on a schedule (Vercel Cron or any
pinger). The cache is **in-process by default (zero config)**; set a Vercel KV / Upstash store
(`KV_REST_API_URL` + `KV_REST_API_TOKEN`) to share it across every instance.

## Use it as an MCP server

This app **is** a remote MCP server, so you can connect your MCP client (Claude Desktop,
Claude Code, Cursor, …) and let the model fetch jobs for a candidate.

- **Endpoint:** `https://job-search-mcp-tau.vercel.app/api/mcp` (Streamable HTTP + SSE)
- **Tools:** `profile_upsert`, `jobs_search`, `letter_generate`, `qa_reply`

```json
{
  "mcpServers": {
    "job-search": { "url": "https://job-search-mcp-tau.vercel.app/api/mcp" }
  }
}
```

> Ask your assistant: *"Find remote data-engineering roles for someone strong in Python, Spark and SQL"*
> → it calls `jobs_search` and gets back ranked, link-checked jobs with fit scores.

## REST API

| Method & path | Body | Returns |
|---|---|---|
| `GET /api/config` | — | `{ mode, provider, model, liveAiEnabled }` |
| `POST /api/profile` | profile fields | `{ profile }` (normalized) |
| `POST /api/jobs` | `{ query, profile, limit?, remoteOnly?, location?, live? }` | `{ jobs, count, sources, validated }` |
| `POST /api/letter` | `{ profile, job:{title,company}, tone? }` | `{ text, tone, mode }` |
| `POST /api/qa` | `{ question, profile, context? }` | `{ answer, mode }` |

```bash
curl -s -X POST https://job-search-mcp-tau.vercel.app/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"query":"python data engineer","profile":{"skills":["python","spark","sql"]},"live":true,"limit":5}'
```

## Run it locally

```bash
git clone https://github.com/VikramKavuri/Jobsearch_using_MCP_server.git
cd Jobsearch_using_MCP_server
npm install
npm run dev      # http://localhost:3000
npm test         # 77 unit tests (pure functions, no network)
```

You don't need a `.env` — it starts in demo mode. To turn on live AI, copy `.env.example`
to `.env.local` and set one key (`GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or
`HF_TOKEN`).

## Deploy your own

```bash
npm i -g vercel
vercel --prod    # prompts for login the first time
```

Vercel auto-detects Next.js. Add an API key under **Project → Settings → Environment
Variables** to enable live AI, then redeploy.

## How I built it

```
app/
  page.tsx                       Web UI: 4 tabs (Profile, Job Search, Cover Letter, Q&A)
  api/{config,profile,jobs,letter,qa}/route.ts   thin REST adapters
  api/[transport]/route.ts       MCP endpoint (4 tools) at /api/mcp
  api/cron/revalidate/route.ts   off-path cache warming
lib/
  tools/{profile,search,letter,qa}.ts   pure capability functions (+ unit tests)
  ranking.ts                     TF-IDF cosine over job text (pure TS)
  jobs-source.ts                 5 live sources + bundled sample, mappers, dedupe
  link-check.ts                  reachability validation for live job links
  cache.ts                       in-memory + Vercel KV cache, one tiny interface
  config.ts                      env → real-vs-demo decision (the only env reader)
  llm.ts                         provider abstraction (Groq / OpenAI / Anthropic / HF ↔ demo)
  service.ts                     composition root shared by REST + MCP
```

I kept the capability functions in `lib/tools/*` and `lib/ranking.ts` **pure** — no Next, no
env, no network — so I can unit-test them in isolation. `lib/config.ts` is the only place that
reads env and decides demo-vs-live; the tools receive an injected `llm` and never branch on the
environment. REST and MCP both call `lib/service.ts`, so the two surfaces can't drift.

> **Deeper dive:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) has the data flow, my design
> trade-offs, and an honest look at what I'd change to push this further.

## Engineering highlights

- **One core, three surfaces.** I made the web UI, REST, and MCP thin adapters over a single
  composition root (`lib/service.ts`) — zero duplicated logic, so the surfaces can't drift.
- **Testable by construction.** Ranking and the four capabilities are pure functions;
  **77 deterministic unit tests** run offline (Vitest) and on CI on every push.
- **Fast where it matters.** Two-layer caching (source results + link reachability) takes a
  repeat live search from **~3.7s to ~80ms** while keeping every link verified.
- **Resilient by design.** I fetch five sources in parallel and each degrades to `[]` on
  failure; results are de-duped, ranked, and link-checked — one dead source or dead link
  never breaks search.
- **Pluggable AI.** A provider abstraction (`lib/llm.ts`) swaps Groq / OpenAI / Anthropic / HF
  behind one interface, with a deterministic demo path so nothing requires a key.

## Notes

- **Attribution:** live job data comes from Remotive, The Muse, Arbeitnow, RemoteOK and Jobicy. RemoteOK and The Muse ask that you credit them when you display their results — so I do.
- Stateless by design — there's no database; your profile lives in your browser.
- This is my clean Vercel rebuild of the original Hugging Face Spaces "Job Search MCP" concept (no torch / faiss / Gradio).

## License

[MIT](LICENSE) © VikramKavuri
