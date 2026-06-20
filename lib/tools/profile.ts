// profile.upsert — validate and normalize an inbound profile.
// Pure function, no I/O. The server is stateless; the normalized profile is
// returned to the caller (the web UI persists it and passes it back inline).

import type { Profile } from "../types";

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

export interface ProfileInput {
  name?: string;
  title?: string;
  summary?: string;
  /** Either an array or a comma/newline-separated string. */
  skills?: string[] | string;
  experienceYears?: number | string;
  location?: string;
  education?: string;
  email?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSkillList(skills: ProfileInput["skills"]): string[] {
  const raw = Array.isArray(skills) ? skills : str(skills).split(/[,\n]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const skill = String(item).trim().toLowerCase();
    if (skill && !seen.has(skill)) {
      seen.add(skill);
      out.push(skill);
    }
  }
  return out;
}

function toYears(value: ProfileInput["experienceYears"]): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function normalizeProfile(input: ProfileInput): Profile {
  if (input === null || typeof input !== "object") {
    throw new ProfileValidationError("Profile must be an object.");
  }

  const name = str(input.name);
  const title = str(input.title);
  const skills = toSkillList(input.skills);

  if (!name && !title && skills.length === 0) {
    throw new ProfileValidationError(
      "Profile must include at least a name, title, or skills.",
    );
  }

  let email: string | undefined;
  if (input.email !== undefined && str(input.email) !== "") {
    const candidate = str(input.email).toLowerCase();
    if (!EMAIL_RE.test(candidate)) {
      throw new ProfileValidationError(`Invalid email address: "${input.email}".`);
    }
    email = candidate;
  }

  const profile: Profile = {
    name,
    title,
    summary: str(input.summary),
    skills,
    experienceYears: toYears(input.experienceYears),
    location: str(input.location),
    education: str(input.education),
  };
  if (email) profile.email = email;
  return profile;
}
