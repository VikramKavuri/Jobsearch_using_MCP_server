// Job sources: the bundled sample (always available) and an optional, keyless
// live fetch from Remotive. Pure helpers (stripHtml, dedupeJobs, mapRemotiveJob)
// are unit-tested; the network fetch degrades gracefully to the sample.

import type { Job } from "./types";
import sampleData from "../data/sample-jobs.json";

export function getSampleJobs(): Job[] {
  return sampleData as Job[];
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
    type: (r.job_type || "full_time")
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("-"),
    tags: Array.isArray(r.tags) ? r.tags.slice(0, 10) : [],
    description: stripHtml(r.description ?? ""),
    url: r.url,
    ...(r.salary ? { salary: r.salary } : {}),
    ...(r.publication_date ? { postedAt: r.publication_date.slice(0, 10) } : {}),
  };
}

/** Optional keyless live fetch from Remotive. Returns [] on any failure so the
 * caller can always fall back to the sample. */
export async function fetchRemotiveJobs(
  query = "",
  limit = 20,
): Promise<Job[]> {
  try {
    const url = new URL("https://remotive.com/api/remote-jobs");
    if (query.trim()) url.searchParams.set("search", query.trim());
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { jobs?: RemotiveJob[] };
    return (data.jobs ?? []).map(mapRemotiveJob);
  } catch {
    return [];
  }
}

/** Combined source: sample plus (optionally) live jobs, deduped. */
export async function getJobs(opts: {
  live?: boolean;
  query?: string;
} = {}): Promise<Job[]> {
  const sample = getSampleJobs();
  if (!opts.live) return sample;
  const live = await fetchRemotiveJobs(opts.query ?? "");
  return dedupeJobs([...live, ...sample]);
}
