// letter.generate — produce a cover letter.
// Demo path fills a deterministic, tone-aware template. Live path delegates to
// the injected LLM. The tool never reads env; it only inspects llm.mode.

import type { Job, Llm, Profile, Tone } from "../types";
import { TONES } from "../types";

export interface LetterInput {
  profile: Partial<Profile>;
  job: Pick<Job, "title" | "company"> & Partial<Job>;
  tone?: Tone;
  /** Optional extra achievements to weave in. */
  highlights?: string[];
}

export interface LetterResult {
  text: string;
  tone: Tone;
  mode: "demo" | "live";
}

function coerceTone(tone: unknown): Tone {
  return TONES.includes(tone as Tone) ? (tone as Tone) : "professional";
}

const GREETING: Record<Tone, (company: string) => string> = {
  professional: () => "Dear Hiring Manager,",
  formal: () => "Dear Hiring Manager,",
  casual: (company) => `Hi ${company} team,`,
  enthusiastic: (company) => `Hi ${company} team,`,
};

const OPENER: Record<Tone, (title: string, company: string) => string> = {
  professional: (title, company) =>
    `I am writing to express my interest in the ${title} position at ${company}.`,
  formal: (title, company) =>
    `I am writing to formally apply for the ${title} position at ${company}.`,
  casual: (title, company) =>
    `I'm really excited to apply for the ${title} role at ${company}.`,
  enthusiastic: (title, company) =>
    `I was thrilled to discover the ${title} opening at ${company} — it's exactly the kind of role I've been hoping for.`,
};

const CLOSER: Record<Tone, string> = {
  professional:
    "Thank you for considering my application. I would welcome the opportunity to discuss how I can contribute to your team.",
  formal:
    "Thank you for your time and consideration. I would be grateful for the opportunity to discuss my application further.",
  casual:
    "Thanks for taking a look — I'd love to chat about how I can help the team.",
  enthusiastic:
    "I'd be delighted to bring my energy to your team and would love to talk soon!",
};

function renderTemplate(input: LetterInput, tone: Tone): string {
  const { profile, job } = input;
  const name = profile.name?.trim() || "A candidate";
  const title = job.title;
  const company = job.company;
  const skills = (profile.skills ?? []).slice(0, 6);
  const years = profile.experienceYears ?? 0;

  const expSentence =
    years > 0
      ? `With ${years} year${years === 1 ? "" : "s"} of experience as a ${profile.title || "professional"}, I have developed strong expertise that aligns well with this role.`
      : `As a ${profile.title || "motivated professional"}, I am eager to bring my expertise to this role.`;

  const skillSentence =
    skills.length > 0
      ? `My core strengths include ${skills.join(", ")}, which map directly to what ${company} is looking for.`
      : "";

  const highlightLines = (input.highlights ?? [])
    .map((h) => h.trim())
    .filter(Boolean);
  const highlightBlock =
    highlightLines.length > 0
      ? `\n\nA few highlights:\n${highlightLines.map((h) => `• ${h}`).join("\n")}`
      : "";

  const summarySentence = profile.summary?.trim()
    ? ` ${profile.summary.trim()}`
    : "";

  return [
    GREETING[tone](company),
    "",
    `${OPENER[tone](title, company)} ${expSentence}${summarySentence}`.trim(),
    skillSentence,
    highlightBlock ? highlightBlock.trimStart() : "",
    CLOSER[tone],
    "",
    "Sincerely,",
    name,
  ]
    .filter((line) => line !== "")
    .join("\n\n");
}

function buildPrompt(input: LetterInput, tone: Tone): string {
  const { profile, job } = input;
  const skills = (profile.skills ?? []).join(", ");
  const highlights = (input.highlights ?? []).join("; ");
  return [
    `Write a ${tone} cover letter (about 200-300 words) for the role below.`,
    "",
    `Role: ${job.title} at ${job.company}`,
    job.location ? `Location: ${job.location}` : "",
    job.description ? `Job description: ${job.description}` : "",
    "",
    "Candidate:",
    `- Name: ${profile.name || "(unnamed)"}`,
    `- Current title: ${profile.title || "(n/a)"}`,
    `- Years of experience: ${profile.experienceYears ?? 0}`,
    skills ? `- Skills: ${skills}` : "",
    profile.summary ? `- Summary: ${profile.summary}` : "",
    highlights ? `- Highlights: ${highlights}` : "",
    "",
    "Return only the letter text, signed with the candidate's name. Do not invent facts.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateLetter(
  input: LetterInput,
  llm: Llm,
): Promise<LetterResult> {
  const tone = coerceTone(input.tone);

  if (llm.mode === "live") {
    const text = await llm.complete(buildPrompt(input, tone), {
      system:
        "You are an expert career coach who writes concise, specific, honest cover letters.",
    });
    return { text: text.trim(), tone, mode: "live" };
  }

  return { text: renderTemplate(input, tone), tone, mode: "demo" };
}
