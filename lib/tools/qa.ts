// qa.reply — answer an interview/application question.
// Demo path assembles a heuristic answer from the profile, routed by keywords
// in the question. Live path delegates to the injected LLM.

import type { Llm, Profile } from "../types";

export class QaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaValidationError";
  }
}

export interface QaInput {
  question: string;
  profile?: Partial<Profile>;
  /** Optional extra context, e.g. the job description. */
  context?: string;
}

export interface QaResult {
  answer: string;
  mode: "demo" | "live";
}

function has(question: string, ...needles: string[]): boolean {
  const q = question.toLowerCase();
  return needles.some((n) => q.includes(n));
}

function heuristicAnswer(question: string, profile: Partial<Profile>): string {
  const name = profile.name?.trim() || "I";
  const title = profile.title?.trim() || "professional";
  const skills = profile.skills ?? [];
  const years = profile.experienceYears ?? 0;
  const intro = profile.name ? `${name} here. ` : "";

  if (has(question, "skill", "strength", "technolog", "stack", "tool")) {
    const list = skills.length > 0 ? skills.join(", ") : "a broad, adaptable toolkit";
    return `${intro}My strongest skills are ${list}. As a ${title}, I apply them daily to ship reliable, well-tested work.`;
  }

  if (has(question, "year", "experience", "how long", "senior", "junior")) {
    return `${intro}I have ${years} year${years === 1 ? "" : "s"} of professional experience as a ${title}, which has given me both hands-on depth and the judgment to make sound trade-offs.`;
  }

  if (has(question, "weakness", "improve", "struggle")) {
    return `${intro}Earlier in my career I tried to do everything myself; I've since learned to delegate and to ask for review early. I actively work on it and it has made me a stronger ${title}.`;
  }

  if (has(question, "education", "degree", "study", "studied", "school", "university")) {
    const edu = profile.education?.trim() || "a strong self-directed learning record";
    return `${intro}My background includes ${edu}, and I keep my skills current through continuous, hands-on learning.`;
  }

  if (has(question, "location", "relocat", "remote", "onsite", "on-site", "where")) {
    const loc = profile.location?.trim() || "a flexible base";
    return `${intro}I'm based in ${loc} and I'm comfortable working remotely; I'm open to discussing arrangements that suit the team.`;
  }

  if (has(question, "why", "fit", "hire", "interest", "motivat")) {
    const summary = profile.summary?.trim();
    const skillBit = skills.length > 0 ? ` My experience with ${skills.slice(0, 3).join(", ")} maps directly to what you need.` : "";
    return `${intro}You should consider me because I'm a ${title} who delivers.${summary ? ` ${summary}` : ""}${skillBit}`;
  }

  // "Tell me about yourself" and everything else.
  const summary = profile.summary?.trim();
  const skillBit = skills.length > 0 ? ` I work most with ${skills.slice(0, 3).join(", ")}.` : "";
  return `${intro}I'm a ${title} with ${years} year${years === 1 ? "" : "s"} of experience.${summary ? ` ${summary}` : ""}${skillBit}`;
}

function buildPrompt(input: QaInput): string {
  const p = input.profile ?? {};
  return [
    "Answer the following question in the first person, as this candidate, for a job application or interview. Be concise, specific, and honest. Do not invent facts not supported by the profile.",
    "",
    `Question: ${input.question}`,
    input.context ? `Context: ${input.context}` : "",
    "",
    "Candidate profile:",
    `- Name: ${p.name || "(unnamed)"}`,
    `- Title: ${p.title || "(n/a)"}`,
    `- Years of experience: ${p.experienceYears ?? 0}`,
    p.skills?.length ? `- Skills: ${p.skills.join(", ")}` : "",
    p.summary ? `- Summary: ${p.summary}` : "",
    p.education ? `- Education: ${p.education}` : "",
    p.location ? `- Location: ${p.location}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function answerQuestion(input: QaInput, llm: Llm): Promise<QaResult> {
  const question = input.question?.trim() ?? "";
  if (!question) {
    throw new QaValidationError("A non-empty question is required.");
  }

  if (llm.mode === "live") {
    const answer = await llm.complete(buildPrompt({ ...input, question }), {
      system: "You are helping a job candidate answer application questions truthfully and persuasively.",
    });
    return { answer: answer.trim(), mode: "live" };
  }

  return { answer: heuristicAnswer(question, input.profile ?? {}), mode: "demo" };
}
