// jobs.search — rank jobs against a query + profile and explain why.
// Pure function: jobs are passed in (the route loads them from jobs-source),
// so this stays unit-testable with no I/O.

import type { Job, Profile, RankedJob } from "../types";
import { rankByCosine, tokenize } from "../ranking";

export interface SearchInput {
  query?: string;
  profile?: Partial<Profile>;
  jobs: Job[];
  limit?: number;
  remoteOnly?: boolean;
  /** Free-text location filter; remote jobs always pass. */
  location?: string;
}

/** Weight of normalized text similarity vs. profile-skill coverage in fit. */
const TEXT_WEIGHT = 0.6;
const SKILL_WEIGHT = 0.4;
const DEFAULT_LIMIT = 10;

function jobDocument(job: Job): string {
  return [
    job.title,
    job.company,
    job.location,
    job.type,
    job.tags.join(" "),
    job.description,
  ].join(" ");
}

/** A multi-word skill counts as present only if every one of its tokens is. */
function skillPresent(skill: string, jobTokens: Set<string>): boolean {
  const parts = tokenize(skill);
  return parts.length > 0 && parts.every((p) => jobTokens.has(p));
}

export function searchJobs(input: SearchInput): RankedJob[] {
  const { jobs, profile = {}, query = "" } = input;
  const limit = input.limit ?? DEFAULT_LIMIT;

  // Filtering first so ranking only considers eligible jobs.
  const locationNeedle = input.location?.trim().toLowerCase();
  const eligible = jobs.filter((job) => {
    if (input.remoteOnly && !job.remote) return false;
    if (locationNeedle) {
      const inLocation = job.location.toLowerCase().includes(locationNeedle);
      if (!job.remote && !inLocation) return false;
    }
    return true;
  });

  if (eligible.length === 0) return [];

  const skills = (profile.skills ?? []).map((s) => s.toLowerCase());
  const queryText = [
    query,
    profile.title ?? "",
    profile.summary ?? "",
    skills.join(" "),
  ].join(" ");

  const docs = eligible.map(jobDocument);
  const rawScores = rankByCosine(queryText, docs);
  const maxScore = Math.max(...rawScores, 0);

  const queryTokens = new Set(tokenize([query, skills.join(" ")].join(" ")));

  const ranked: (RankedJob & { _raw: number })[] = eligible.map((job, i) => {
    const jobTokens = new Set(tokenize(jobDocument(job)));
    const textComponent = maxScore > 0 ? rawScores[i] / maxScore : 0;

    const matchedSkills = skills.filter((s) => skillPresent(s, jobTokens));
    const skillComponent =
      skills.length > 0 ? matchedSkills.length / skills.length : textComponent;

    const fit = Math.round(
      100 * (TEXT_WEIGHT * textComponent + SKILL_WEIGHT * skillComponent),
    );

    return {
      ...job,
      fit_score: Math.max(0, Math.min(100, fit)),
      match_reasons: buildReasons(job, matchedSkills, queryTokens, jobTokens),
      _raw: rawScores[i],
    };
  });

  ranked.sort(
    (a, b) =>
      b.fit_score - a.fit_score || b._raw - a._raw || a.title.localeCompare(b.title),
  );

  return ranked.slice(0, limit).map(({ _raw, ...job }) => job);
}

function buildReasons(
  job: Job,
  matchedSkills: string[],
  queryTokens: Set<string>,
  jobTokens: Set<string>,
): string[] {
  const reasons: string[] = [];

  if (matchedSkills.length > 0) {
    reasons.push(`Matches your skills: ${matchedSkills.slice(0, 5).join(", ")}`);
  }

  const matchedSkillTokens = new Set(matchedSkills.flatMap((s) => tokenize(s)));
  const keywordHits = [...queryTokens].filter(
    (t) => jobTokens.has(t) && !matchedSkillTokens.has(t),
  );
  if (keywordHits.length > 0) {
    reasons.push(`Relevant keywords: ${keywordHits.slice(0, 4).join(", ")}`);
  }

  if (job.remote) reasons.push("Remote-friendly role");

  if (reasons.length === 0) {
    reasons.push("General match based on overall relevance");
  }
  return reasons;
}
