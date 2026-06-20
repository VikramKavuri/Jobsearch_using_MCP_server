// Composition root: wires config + llm + jobs source into the pure tools.
// Both the REST routes and the MCP handler call these functions, so the two
// faces always behave identically. This is the only layer that reads env (via
// loadConfig/createLlm) — the tools stay pure.

import { loadConfig } from "./config";
import { createLlm } from "./llm";
import { getJobs } from "./jobs-source";
import { normalizeProfile, type ProfileInput } from "./tools/profile";
import { searchJobs, type SearchInput } from "./tools/search";
import { generateLetter, type LetterInput } from "./tools/letter";
import { answerQuestion, type QaInput } from "./tools/qa";
import type { Profile, RankedJob, Tone } from "./types";

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

export type SearchArgs = Omit<SearchInput, "jobs"> & { live?: boolean };

export async function runSearch(input: SearchArgs): Promise<RankedJob[]> {
  const jobs = await getJobs({ live: input.live, query: input.query });
  return searchJobs({ ...input, jobs });
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
