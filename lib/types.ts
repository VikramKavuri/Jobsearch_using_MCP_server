// Shared domain types for the Job Search MCP server.
// These are plain declarations — all behavior lives in the pure functions
// under lib/ and is unit-tested in isolation.

/** A candidate's normalized profile. The server is stateless: the profile is
 * supplied inline on each call (the web UI persists it to localStorage). */
export interface Profile {
  name: string;
  /** Desired or current role, e.g. "Senior Backend Engineer". */
  title: string;
  /** Free-text professional summary. */
  summary: string;
  /** Normalized skill keywords (lowercased, de-duped). */
  skills: string[];
  /** Years of professional experience (>= 0). */
  experienceYears: number;
  location: string;
  education: string;
  email?: string;
}

/** A job posting from the bundled sample or a live keyless source. */
export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  /** e.g. "Full-time", "Contract". */
  type: string;
  /** Skill/keyword tags used for matching and display. */
  tags: string[];
  description: string;
  url: string;
  salary?: string;
  /** ISO date string. */
  postedAt?: string;
  /** Where this job came from, e.g. "Sample", "Remotive", "The Muse". */
  source?: string;
}

/** A job augmented with how well it fits the query + profile. */
export interface RankedJob extends Job {
  /** Fit as a percentage, 0–100 inclusive. */
  fit_score: number;
  /** Human-readable reasons the job matched. */
  match_reasons: string[];
}

export type Tone = "professional" | "casual" | "enthusiastic" | "formal";

export const TONES: readonly Tone[] = [
  "professional",
  "casual",
  "enthusiastic",
  "formal",
];

/** Provider-agnostic text completion, injected into the tools so they never
 * branch on environment themselves. `mode` lets callers report demo vs. live. */
export interface Llm {
  readonly mode: "demo" | "live";
  readonly model: string;
  complete(
    prompt: string,
    opts?: { system?: string; maxTokens?: number; temperature?: number },
  ): Promise<string>;
}
