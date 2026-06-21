// Job sources: the bundled sample (always available) plus optional, keyless live
// fetches from five public APIs (Remotive, The Muse, Arbeitnow, RemoteOK,
// Jobicy). Pure helpers (mappers, stripHtml, dedupeJobs, jobicyGeo) are
// unit-tested; each network fetch degrades gracefully to [] so a single dead
// source never breaks search.

import type { Job } from "./types";
import sampleData from "../data/sample-jobs.json";

/** User-Agent used for every outbound request — some sources (RemoteOK) block
 * the default fetch agent. */
const UA = "job-search-mcp/1.0 (+https://job-search-mcp-tau.vercel.app)";
const PER_SOURCE_LIMIT = 25;
const FETCH_TIMEOUT_MS = 7000;

export function getSampleJobs(): Job[] {
  return (sampleData as Job[]).map((j) => ({ ...j, source: "Sample" }));
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Strip HTML tags, decode common entities, and collapse whitespace. */
export function stripHtml(html: string): string {
  const noTags = html.replace(/<[^>]*>/g, " ");
  const decoded = noTags.replace(
    /&amp;|&lt;|&gt;|&quot;|&#39;|&apos;|&nbsp;/g,
    (m) => ENTITIES[m] ?? m,
  );
  return decoded.replace(/\s+/g, " ").trim();
}

/** Remove duplicates by id, then by normalized title+company. */
export function dedupeJobs(jobs: Job[]): Job[] {
  const seenId = new Set<string>();
  const seenKey = new Set<string>();
  const out: Job[] = [];
  for (const job of jobs) {
    const key = `${job.title.trim().toLowerCase()}@@${job.company.trim().toLowerCase()}`;
    if (seenId.has(job.id) || seenKey.has(key)) continue;
    seenId.add(job.id);
    seenKey.add(key);
    out.push(job);
  }
  return out;
}

function titleCaseType(raw: string): string {
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");
}

// ---------------------------------------------------------------------------
// Mappers (pure)
// ---------------------------------------------------------------------------

interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  job_type?: string;
  tags?: string[];
  description?: string;
  url: string;
  salary?: string;
  publication_date?: string;
}

export function mapRemotiveJob(r: RemotiveJob): Job {
  return {
    id: `remotive-${r.id}`,
    title: r.title,
    company: r.company_name,
    location: r.candidate_required_location || "Remote",
    remote: true, // Remotive only lists remote roles
    type: titleCaseType(r.job_type || "full_time"),
    tags: Array.isArray(r.tags) ? r.tags.slice(0, 10) : [],
    description: stripHtml(r.description ?? ""),
    url: r.url,
    source: "Remotive",
    ...(r.salary ? { salary: r.salary } : {}),
    ...(r.publication_date ? { postedAt: r.publication_date.slice(0, 10) } : {}),
  };
}

interface MuseJob {
  id: number;
  name: string;
  company?: { name?: string };
  locations?: { name: string }[];
  categories?: { name: string }[];
  levels?: { name: string }[];
  tags?: { name: string }[];
  contents?: string;
  publication_date?: string;
  refs?: { landing_page?: string };
}

export function mapMuseJob(r: MuseJob): Job {
  const locationNames = (r.locations ?? []).map((l) => l.name);
  const remote = locationNames.some((n) => /remote|flexible|anywhere/i.test(n));
  const tags = [
    ...(r.categories ?? []).map((c) => c.name),
    ...(r.levels ?? []).map((l) => l.name),
  ].filter(Boolean);
  return {
    id: `muse-${r.id}`,
    title: r.name,
    company: r.company?.name ?? "Unknown",
    location: locationNames.join(" · ") || "Flexible / Remote",
    remote,
    type: "Full-time",
    tags: tags.slice(0, 10),
    description: stripHtml(r.contents ?? ""),
    url: r.refs?.landing_page ?? "",
    source: "The Muse",
    ...(r.publication_date ? { postedAt: r.publication_date.slice(0, 10) } : {}),
  };
}

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote?: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

export function mapArbeitnowJob(r: ArbeitnowJob): Job {
  return {
    id: `arbeitnow-${r.slug}`,
    title: r.title,
    company: r.company_name,
    location: r.location || (r.remote ? "Remote" : "Unspecified"),
    remote: Boolean(r.remote),
    type: titleCaseType(r.job_types?.[0] || "full_time"),
    tags: Array.isArray(r.tags) ? r.tags.slice(0, 10) : [],
    description: stripHtml(r.description ?? ""),
    url: r.url,
    source: "Arbeitnow",
    ...(r.created_at
      ? { postedAt: new Date(r.created_at * 1000).toISOString().slice(0, 10) }
      : {}),
  };
}

interface RemoteOkJob {
  id: string | number;
  position?: string;
  company?: string;
  location?: string;
  url?: string;
  apply_url?: string;
  tags?: string[];
  description?: string;
  date?: string;
  salary_min?: number;
  salary_max?: number;
}

export function mapRemoteOkJob(r: RemoteOkJob): Job {
  const salary =
    r.salary_min && r.salary_max
      ? `$${Math.round(r.salary_min / 1000)}k–$${Math.round(r.salary_max / 1000)}k`
      : undefined;
  return {
    id: `remoteok-${r.id}`,
    title: r.position ?? "Untitled",
    company: r.company ?? "Unknown",
    location: r.location?.trim() || "Remote",
    remote: true,
    type: "Full-time",
    tags: Array.isArray(r.tags) ? r.tags.slice(0, 10) : [],
    description: stripHtml(r.description ?? ""),
    url: r.url || r.apply_url || "",
    source: "RemoteOK",
    ...(salary ? { salary } : {}),
    ...(r.date ? { postedAt: r.date.slice(0, 10) } : {}),
  };
}

interface JobicyJob {
  id: string | number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobIndustry?: string[];
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
}

export function mapJobicyJob(r: JobicyJob): Job {
  const tags = [
    ...(r.jobIndustry ?? []).map((t) => stripHtml(t)),
    ...(r.jobLevel ? [r.jobLevel] : []),
  ].filter(Boolean);
  return {
    id: `jobicy-${r.id}`,
    title: r.jobTitle,
    company: r.companyName,
    location: r.jobGeo?.trim() || "Remote",
    remote: true,
    type: titleCaseType(r.jobType?.[0] || "full_time"),
    tags: tags.slice(0, 10),
    description: stripHtml(r.jobDescription || r.jobExcerpt || ""),
    url: r.url,
    source: "Jobicy",
    ...(r.pubDate ? { postedAt: r.pubDate.slice(0, 10) } : {}),
  };
}

/** Map a free-text location to a Jobicy `geo` region slug, or undefined. */
export function jobicyGeo(location: string): string | undefined {
  const l = location.toLowerCase();
  if (!l.trim()) return undefined;
  if (/\b(uk|united kingdom|england|scotland|wales|london)\b/.test(l)) return "uk";
  if (/\b(usa|u\.s\.|united states|america|new york|san francisco|california|texas|seattle|boston|chicago)\b/.test(l))
    return "usa";
  if (/\bcanada|toronto|vancouver|montreal\b/.test(l)) return "canada";
  if (/\bgermany|berlin|munich|deutschland\b/.test(l)) return "germany";
  if (/\b(europe|eu|france|spain|italy|netherlands|amsterdam|paris)\b/.test(l))
    return "europe";
  if (/\b(india|bangalore|bengaluru|mumbai|delhi)\b/.test(l)) return "india";
  if (/\b(australia|sydney|melbourne)\b/.test(l)) return "australia";
  return undefined;
}

// ---------------------------------------------------------------------------
// Fetchers (network, graceful)
// ---------------------------------------------------------------------------

async function getJson(url: string | URL): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface SourceFilters {
  /** Role / keyword text (query box + profile title). */
  query?: string;
  /** Free-text location from the profile, e.g. "London, UK". */
  location?: string;
}

export async function fetchRemotiveJobs(f: SourceFilters = {}): Promise<Job[]> {
  const url = new URL("https://remotive.com/api/remote-jobs");
  if (f.query?.trim()) url.searchParams.set("search", f.query.trim());
  url.searchParams.set("limit", String(PER_SOURCE_LIMIT));
  const data = (await getJson(url)) as { jobs?: RemotiveJob[] } | null;
  return (data?.jobs ?? []).map(mapRemotiveJob);
}

export async function fetchMuseJobs(f: SourceFilters = {}): Promise<Job[]> {
  const url = new URL("https://www.themuse.com/api/public/jobs");
  url.searchParams.set("page", "1");
  // The Muse filters by location vocabulary (e.g. "New York, NY"); pass it
  // best-effort. Bad values just widen the result set, which the unified
  // ranking + location filter then narrows.
  if (f.location?.trim()) url.searchParams.set("location", f.location.trim());
  const data = (await getJson(url)) as { results?: MuseJob[] } | null;
  return (data?.results ?? []).slice(0, PER_SOURCE_LIMIT).map(mapMuseJob);
}

export async function fetchArbeitnowJobs(_f: SourceFilters = {}): Promise<Job[]> {
  // Arbeitnow has no server-side search; filtering happens in ranking.
  const data = (await getJson("https://www.arbeitnow.com/api/job-board-api")) as
    | { data?: ArbeitnowJob[] }
    | null;
  return (data?.data ?? []).slice(0, PER_SOURCE_LIMIT).map(mapArbeitnowJob);
}

export async function fetchRemoteOkJobs(f: SourceFilters = {}): Promise<Job[]> {
  const url = new URL("https://remoteok.com/api");
  // RemoteOK accepts a single tag; use the first query word if present.
  const tag = f.query?.trim().split(/\s+/)[0];
  if (tag) url.searchParams.set("tags", tag);
  const data = (await getJson(url)) as RemoteOkJob[] | null;
  if (!Array.isArray(data)) return [];
  // The first element is a legal/metadata notice — skip anything without a position.
  return data
    .filter((r) => r && r.position && r.id)
    .slice(0, PER_SOURCE_LIMIT)
    .map(mapRemoteOkJob);
}

export async function fetchJobicyJobs(f: SourceFilters = {}): Promise<Job[]> {
  const url = new URL("https://jobicy.com/api/v2/remote-jobs");
  url.searchParams.set("count", String(PER_SOURCE_LIMIT));
  const geo = f.location ? jobicyGeo(f.location) : undefined;
  if (geo) url.searchParams.set("geo", geo);
  const tag = f.query?.trim().split(/\s+/)[0];
  if (tag) url.searchParams.set("tag", tag);
  const data = (await getJson(url)) as { jobs?: JobicyJob[] } | null;
  return (data?.jobs ?? []).map(mapJobicyJob);
}

const LIVE_SOURCES = [
  fetchRemotiveJobs,
  fetchMuseJobs,
  fetchArbeitnowJobs,
  fetchRemoteOkJobs,
  fetchJobicyJobs,
];

/** Distinct source labels currently contributing to a result set. */
export function sourcesOf(jobs: Job[]): string[] {
  return [...new Set(jobs.map((j) => j.source).filter(Boolean) as string[])];
}

/** Combined source. Demo: the bundled sample only. Live: every source fetched
 * in parallel, merged + deduped, with the sample as a fallback if all live
 * sources fail. */
export async function getJobs(
  opts: { live?: boolean } & SourceFilters = {},
): Promise<Job[]> {
  const sample = getSampleJobs();
  if (!opts.live) return sample;

  const filters: SourceFilters = { query: opts.query, location: opts.location };
  const settled = await Promise.all(
    LIVE_SOURCES.map((fetcher) => fetcher(filters).catch(() => [] as Job[])),
  );
  const live = dedupeJobs(settled.flat());
  return live.length > 0 ? live : sample;
}
