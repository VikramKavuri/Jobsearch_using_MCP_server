// Composition root: wires config + llm + jobs source into the pure tools.
// Both the REST routes and the MCP handler call these functions, so the two
// faces always behave identically. This is the only layer that reads env (via
// loadConfig/createLlm) — the tools stay pure.

import { loadConfig } from "./config";
import { createLlm } from "./llm";
import { getJobs } from "./jobs-source";
import { validateJobLinks } from "./link-check";
import { getCache } from "./cache";
import { normalizeProfile, type ProfileInput } from "./tools/profile";
import { searchJobs, type SearchInput } from "./tools/search";
import { generateLetter, type LetterInput } from "./tools/letter";
import { answerQuestion, type QaInput } from "./tools/qa";
import type { Profile, RankedJob, Tone } from "./types";

/** Extra jobs to rank beyond `limit` so dropping dead links still fills the page. */
const LINK_VALIDATE_BUFFER = 8;

export interface AppStatus {
  mode: "demo" | "live";
  provider: string;
  model: string;
  liveAiEnabled: boolean;
}

export function getStatus(): AppStatus {
  const c = loadConfig();
  return {
    mode: c.mode,
    provider: c.provider,
    model: c.model,
    liveAiEnabled: c.liveAiEnabled,
  };
}

export function runProfile(input: ProfileInput): Profile {
  return normalizeProfile(input);
}

export type SearchArgs = Omit<SearchInput, "jobs"> & {
  live?: boolean;
  /** Validate each job URL before returning (defaults on for live search). */
  validateLinks?: boolean;
};

export interface SearchResult {
  jobs: RankedJob[];
  count: number;
  /** Distinct sources represented in the results. */
  sources: string[];
  /** Whether returned links were reachability-checked. */
  validated: boolean;
}

export async function runSearch(input: SearchArgs): Promise<SearchResult> {
  const profile = input.profile ?? {};
  // Profile-driven filters: role keyword (query box, else the profile title)
  // and location feed the source APIs; ranking + the location filter narrow.
  const role = input.query?.trim() || profile.title?.trim() || "";
  const location = input.location ?? profile.location;
  const limit = input.limit ?? 10;

  const fetched = await getJobs({ live: input.live, query: role, location });
  const hasLive = fetched.some((j) => j.source && j.source !== "Sample");
  const validate =
    Boolean(input.live) && hasLive && (input.validateLinks ?? true);

  const ranked = searchJobs({
    ...input,
    location,
    jobs: fetched,
    limit: validate ? limit + LINK_VALIDATE_BUFFER : limit,
  });

  const jobs = validate
    ? (await validateJobLinks(ranked, { cache: getCache() })).slice(0, limit)
    : ranked.slice(0, limit);

  return {
    jobs,
    count: jobs.length,
    sources: [...new Set(jobs.map((j) => j.source).filter(Boolean) as string[])],
    validated: validate,
  };
}

/** Pre-warm the caches off the request path: run a set of common live searches
 * so subsequent user requests hit warm source + link caches. Returns a summary
 * for the revalidation endpoint. */
export async function warmCache(
  queries: { query?: string; location?: string }[] = [{}],
): Promise<{ warmed: number; backend: string }> {
  for (const q of queries) {
    await runSearch({ ...q, live: true, limit: 12 });
  }
  return { warmed: queries.length, backend: getCache().backend };
}

export async function runLetter(
  input: LetterInput,
): Promise<{ text: string; tone: Tone; mode: "demo" | "live" }> {
  const llm = createLlm(loadConfig());
  return generateLetter(input, llm);
}

export async function runQa(
  input: QaInput,
): Promise<{ answer: string; mode: "demo" | "live" }> {
  const llm = createLlm(loadConfig());
  return answerQuestion(input, llm);
}
