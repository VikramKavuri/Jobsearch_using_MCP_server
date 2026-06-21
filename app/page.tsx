"use client";

import { useEffect, useState } from "react";
import type { RankedJob, Tone } from "@/lib/types";

type TabId = "profile" | "search" | "letter" | "qa";
type SearchResponse = {
  jobs: RankedJob[];
  count: number;
  sources: string[];
  validated: boolean;
};
type Status = {
  mode: "demo" | "live";
  provider: string;
  model: string;
  liveAiEnabled: boolean;
};

const TABS: { id: TabId; num: string; label: string }[] = [
  { id: "profile", num: "01", label: "Profile" },
  { id: "search", num: "02", label: "Job Search" },
  { id: "letter", num: "03", label: "Cover Letter" },
  { id: "qa", num: "04", label: "Q&A" },
];

const TONES: Tone[] = ["professional", "casual", "enthusiastic", "formal"];
const STORAGE_KEY = "job-search-mcp:profile";

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

const EMPTY_FORM = {
  name: "",
  title: "",
  summary: "",
  skills: "",
  experienceYears: "",
  location: "",
  education: "",
  email: "",
};

export default function Page() {
  const [tab, setTab] = useState<TabId>("profile");
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Load persisted profile + live/demo status on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setForm({ ...EMPTY_FORM, ...JSON.parse(saved) });
    } catch {
      /* ignore */
    }
    fetch("/api/config")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const setField = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  /** The working profile (skills as an array) used by all API calls. */
  const profile = {
    name: form.name.trim(),
    title: form.title.trim(),
    summary: form.summary.trim(),
    skills: form.skills
      .split(/[,\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    experienceYears: Number(form.experienceYears) || 0,
    location: form.location.trim(),
    education: form.education.trim(),
    ...(form.email.trim() ? { email: form.email.trim() } : {}),
  };

  const [letterJob, setLetterJob] = useState({ title: "", company: "" });

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">Model Context Protocol · Career Tool</p>
          <h1 className="title">
            Job&nbsp;Search <em>Dossier</em>
          </h1>
          <p className="tagline">
            Rank roles, draft cover letters, and rehearse answers — as a web app
            and as a connectable MCP server. Works with zero API keys.
          </p>
        </div>
        <ModeBadge status={status} />
      </header>

      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className="tab"
            onClick={() => setTab(t.id)}
          >
            <span className="num">{t.num}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <section role="tabpanel" key={tab}>
        {tab === "profile" && (
          <ProfileTab form={form} setField={setField} profile={profile} />
        )}
        {tab === "search" && (
          <SearchTab
            profile={profile}
            onDraftLetter={(job) => {
              setLetterJob({ title: job.title, company: job.company });
              setTab("letter");
            }}
          />
        )}
        {tab === "letter" && (
          <LetterTab profile={profile} job={letterJob} setJob={setLetterJob} />
        )}
        {tab === "qa" && <QaTab profile={profile} />}
      </section>

      <footer className="foot">
        <span>Bundled sample data · TF-IDF ranking · stateless by design</span>
        <span>
          MCP endpoint: <code>/api/mcp</code>
        </span>
      </footer>
    </main>
  );
}

function ModeBadge({ status }: { status: Status | null }) {
  if (!status) {
    return (
      <span className="mode-badge demo">
        <span className="dot" /> checking…
      </span>
    );
  }
  return status.liveAiEnabled ? (
    <span className="mode-badge live" title={`Model: ${status.model}`}>
      <span className="dot" /> Live AI · {status.provider}
    </span>
  ) : (
    <span className="mode-badge demo" title="Set an API key to enable live AI">
      <span className="dot" /> Demo mode
    </span>
  );
}

/* ----- Profile ------------------------------------------------------------ */
function ProfileTab({
  form,
  setField,
  profile,
}: {
  form: typeof EMPTY_FORM;
  setField: (k: keyof typeof EMPTY_FORM) => (v: string) => void;
  profile: Record<string, unknown>;
}) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setSaved(false);
    try {
      await postJSON("/api/profile", { ...profile, skills: form.skills });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Your profile</h2>
        <p className="panel-note">
          Saved to this browser only — the server stays stateless and passes your
          profile inline to each tool.
        </p>
      </div>

      <div className="grid two">
        <Field label="Full name">
          <input
            value={form.name}
            onChange={(e) => setField("name")(e.target.value)}
            placeholder="Ada Lovelace"
          />
        </Field>
        <Field label="Desired / current title">
          <input
            value={form.title}
            onChange={(e) => setField("title")(e.target.value)}
            placeholder="Senior Data Engineer"
          />
        </Field>
      </div>

      <div className="grid" style={{ marginTop: "1.05rem" }}>
        <Field label="Professional summary">
          <textarea
            value={form.summary}
            onChange={(e) => setField("summary")(e.target.value)}
            placeholder="A few sentences about what you build and the impact you've had."
          />
        </Field>
        <Field label="Skills (comma or newline separated)">
          <textarea
            value={form.skills}
            onChange={(e) => setField("skills")(e.target.value)}
            placeholder="python, spark, sql, airflow, aws"
            style={{ minHeight: "70px" }}
          />
        </Field>
      </div>

      <div className="grid two" style={{ marginTop: "1.05rem" }}>
        <Field label="Years of experience">
          <input
            type="number"
            min={0}
            value={form.experienceYears}
            onChange={(e) => setField("experienceYears")(e.target.value)}
            placeholder="6"
          />
        </Field>
        <Field label="Location">
          <input
            value={form.location}
            onChange={(e) => setField("location")(e.target.value)}
            placeholder="London, UK"
          />
        </Field>
        <Field label="Education">
          <input
            value={form.education}
            onChange={(e) => setField("education")(e.target.value)}
            placeholder="BSc Mathematics"
          />
        </Field>
        <Field label="Email (optional)">
          <input
            value={form.email}
            onChange={(e) => setField("email")(e.target.value)}
            placeholder="ada@example.com"
          />
        </Field>
      </div>

      <div className="controls">
        <button className="btn" onClick={save}>
          Save profile
        </button>
        {saved && <span className="notice ok">Profile validated &amp; saved.</span>}
      </div>
      {error && <div className="notice error">{error}</div>}
    </article>
  );
}

/* ----- Job Search --------------------------------------------------------- */
function SearchTab({
  profile,
  onDraftLetter,
}: {
  profile: Record<string, unknown>;
  onDraftLetter: (job: RankedJob) => void;
}) {
  const [query, setQuery] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [live, setLive] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const data = await postJSON<SearchResponse>("/api/jobs", {
        query,
        profile,
        remoteOnly,
        live,
        limit: 12,
      });
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Find matching roles</h2>
        <p className="panel-note">
          Ranked by TF-IDF similarity to your query + profile. Enable live
          listings to pull from 5 sources, filtered by your profile&apos;s role &amp;
          location — every link is checked before it&apos;s shown.
        </p>
      </div>

      <Field label="What are you looking for?">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="e.g. remote python data engineering"
        />
      </Field>

      <div className="controls">
        <button className="btn" onClick={run} disabled={loading}>
          {loading
            ? live
              ? "Searching live sources…"
              : "Ranking…"
            : "Search jobs"}
        </button>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
          />
          Remote only
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => setLive(e.target.checked)}
          />
          Include live listings
        </label>
      </div>

      {error && <div className="notice error">{error}</div>}

      {result && (
        <div className="result">
          <p className="section-rule">
            {result.count} {result.count === 1 ? "match" : "matches"}
            {result.validated ? " · links checked" : ""}
          </p>
          {result.count === 0 ? (
            <p className="empty">
              No matches — try a broader query{live ? "" : " or enable live listings"}.
            </p>
          ) : (
            <>
              <div className="jobs">
                {result.jobs.map((job) => (
                  <JobCard key={job.id} job={job} onDraftLetter={onDraftLetter} />
                ))}
              </div>
              {result.sources.length > 0 && (
                <p className="attribution">
                  Sources: {result.sources.join(" · ")}
                  {result.validated ? " — every link verified reachable" : ""}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

function JobCard({
  job,
  onDraftLetter,
}: {
  job: RankedJob;
  onDraftLetter: (job: RankedJob) => void;
}) {
  return (
    <div className="job">
      <div>
        <h3 className="job-title">
          <a href={job.url} target="_blank" rel="noreferrer">
            {job.title}
          </a>
        </h3>
        <p className="job-meta">
          {job.company} · {job.location} · {job.type}
          {job.salary ? ` · ${job.salary}` : ""}
        </p>
        {job.source && job.source !== "Sample" && (
          <span className="source-chip">via {job.source}</span>
        )}
      </div>

      <div className="fit">
        <div className="fit-num">
          {job.fit_score}
          <span className="pct">%</span>
        </div>
        <div className="fit-label">fit</div>
        <div className="fit-bar">
          <span style={{ width: `${job.fit_score}%` }} />
        </div>
      </div>

      <p className="job-desc">{job.description}</p>

      <div className="reasons">
        {job.match_reasons.map((r, i) => (
          <span className="reason" key={i}>
            {r}
          </span>
        ))}
      </div>

      <div className="tags">
        {job.tags.slice(0, 8).map((t) => (
          <span className="tag" key={t}>
            {t}
          </span>
        ))}
      </div>

      <div className="reasons" style={{ marginTop: "0.6rem" }}>
        <button className="btn ghost" onClick={() => onDraftLetter(job)}>
          Draft cover letter →
        </button>
      </div>
    </div>
  );
}

/* ----- Cover Letter ------------------------------------------------------- */
function LetterTab({
  profile,
  job,
  setJob,
}: {
  profile: Record<string, unknown>;
  job: { title: string; company: string };
  setJob: (j: { title: string; company: string }) => void;
}) {
  const [tone, setTone] = useState<Tone>("professional");
  const [letter, setLetter] = useState<{ text: string; mode: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const data = await postJSON<{ text: string; mode: string }>(
        "/api/letter",
        { profile, job, tone },
      );
      setLetter(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Draft a cover letter</h2>
        <p className="panel-note">
          Template-filled in demo mode; written by a real LLM when a key is set.
        </p>
      </div>

      <div className="grid two">
        <Field label="Job title">
          <input
            value={job.title}
            onChange={(e) => setJob({ ...job, title: e.target.value })}
            placeholder="Senior Data Engineer"
          />
        </Field>
        <Field label="Company">
          <input
            value={job.company}
            onChange={(e) => setJob({ ...job, company: e.target.value })}
            placeholder="Lakeflow"
          />
        </Field>
      </div>

      <div className="controls">
        <Field label="Tone">
          <select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="btn"
          onClick={run}
          disabled={loading || !job.title || !job.company}
          style={{ alignSelf: "end" }}
        >
          {loading ? "Writing…" : "Generate letter"}
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      {letter && (
        <div className="result">
          <p className="section-rule">letter · {letter.mode}</p>
          <div className="letter">{letter.text}</div>
          <div className="controls">
            <button
              className="btn ghost"
              onClick={() => navigator.clipboard?.writeText(letter.text)}
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/* ----- Q&A ---------------------------------------------------------------- */
function QaTab({ profile }: { profile: Record<string, unknown> }) {
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; mode: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const data = await postJSON<{ answer: string; mode: string }>("/api/qa", {
        question,
        profile,
        context: context || undefined,
      });
      setAnswer(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Rehearse an answer</h2>
        <p className="panel-note">
          Answers application or interview questions in your voice, grounded in
          your profile.
        </p>
      </div>

      <Field label="Question">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && question.trim() && run()}
          placeholder="Why should we hire you?"
        />
      </Field>
      <div style={{ marginTop: "1.05rem" }}>
        <Field label="Context (optional)">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Paste the job description or any extra context."
            style={{ minHeight: "70px" }}
          />
        </Field>
      </div>

      <div className="controls">
        <button
          className="btn"
          onClick={run}
          disabled={loading || !question.trim()}
        >
          {loading ? "Thinking…" : "Get answer"}
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      {answer && (
        <div className="result">
          <p className="section-rule">answer · {answer.mode}</p>
          <div className="answer">{answer.answer}</div>
        </div>
      )}
    </article>
  );
}

/* ----- shared ------------------------------------------------------------- */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
