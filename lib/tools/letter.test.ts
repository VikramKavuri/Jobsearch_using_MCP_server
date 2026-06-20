import { describe, expect, test, vi } from "vitest";
import { generateLetter } from "./letter";
import type { Llm } from "../types";

const profile = {
  name: "Ada Lovelace",
  title: "Data Engineer",
  summary: "I build reliable data platforms.",
  skills: ["python", "spark", "sql"],
  experienceYears: 6,
  location: "London",
  education: "BSc Mathematics",
};

const job = { title: "Senior Data Engineer", company: "DataCo" };

/** Demo LLM that explodes if used — proves the template path makes no calls. */
const demoLlm: Llm = {
  mode: "demo",
  model: "demo-template-v1",
  complete: () => {
    throw new Error("demo path must not call the LLM");
  },
};

describe("generateLetter (demo/template path)", () => {
  test("includes the job title and company", async () => {
    const { text } = await generateLetter({ profile, job }, demoLlm);
    expect(text).toContain("Senior Data Engineer");
    expect(text).toContain("DataCo");
  });

  test("includes the candidate name and at least one skill", async () => {
    const { text } = await generateLetter({ profile, job }, demoLlm);
    expect(text).toContain("Ada Lovelace");
    expect(text.toLowerCase()).toContain("python");
  });

  test("defaults to the professional tone and echoes it back", async () => {
    const res = await generateLetter({ profile, job }, demoLlm);
    expect(res.tone).toBe("professional");
    expect(res.mode).toBe("demo");
  });

  test("varies the greeting by tone", async () => {
    const pro = await generateLetter({ profile, job, tone: "professional" }, demoLlm);
    const casual = await generateLetter({ profile, job, tone: "casual" }, demoLlm);
    expect(pro.text).not.toBe(casual.text);
    expect(pro.text).toContain("Dear Hiring Manager");
    expect(casual.text.toLowerCase()).toContain("hi ");
  });

  test("coerces an unknown tone to professional", async () => {
    // @ts-expect-error testing runtime robustness against bad input
    const res = await generateLetter({ profile, job, tone: "spicy" }, demoLlm);
    expect(res.tone).toBe("professional");
  });
});

describe("generateLetter (live/LLM path)", () => {
  test("delegates to the LLM and returns its text with mode 'live'", async () => {
    const complete = vi.fn().mockResolvedValue("A bespoke cover letter.");
    const liveLlm: Llm = { mode: "live", model: "claude-haiku-4-5", complete };

    const res = await generateLetter({ profile, job, tone: "enthusiastic" }, liveLlm);

    expect(res.mode).toBe("live");
    expect(res.text).toBe("A bespoke cover letter.");
    expect(complete).toHaveBeenCalledOnce();
    const prompt = complete.mock.calls[0][0] as string;
    expect(prompt).toContain("DataCo");
    expect(prompt).toContain("Senior Data Engineer");
    expect(prompt).toContain("enthusiastic");
  });
});
