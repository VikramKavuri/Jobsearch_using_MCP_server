import { describe, expect, test, vi } from "vitest";
import { answerQuestion, QaValidationError } from "./qa";
import type { Llm } from "../types";

const profile = {
  name: "Ada Lovelace",
  title: "Data Engineer",
  summary: "I build reliable data platforms end to end.",
  skills: ["python", "spark", "sql"],
  experienceYears: 6,
  location: "London",
  education: "BSc Mathematics",
};

const demoLlm: Llm = {
  mode: "demo",
  model: "demo-template-v1",
  complete: () => {
    throw new Error("demo path must not call the LLM");
  },
};

describe("answerQuestion (demo/heuristic path)", () => {
  test("a skills question surfaces a profile skill", async () => {
    const { answer } = await answerQuestion(
      { question: "What are your strongest technical skills?", profile },
      demoLlm,
    );
    expect(answer.toLowerCase()).toContain("python");
  });

  test("an experience question cites the years of experience", async () => {
    const { answer } = await answerQuestion(
      { question: "How many years of experience do you have?", profile },
      demoLlm,
    );
    expect(answer).toContain("6");
  });

  test("a 'why hire you' question references the candidate's title", async () => {
    const { answer } = await answerQuestion(
      { question: "Why should we hire you?", profile },
      demoLlm,
    );
    expect(answer).toContain("Data Engineer");
  });

  test("reports demo mode", async () => {
    const res = await answerQuestion({ question: "Tell me about yourself", profile }, demoLlm);
    expect(res.mode).toBe("demo");
    expect(res.answer.length).toBeGreaterThan(0);
  });

  test("throws on an empty question", async () => {
    await expect(
      answerQuestion({ question: "   ", profile }, demoLlm),
    ).rejects.toBeInstanceOf(QaValidationError);
  });
});

describe("answerQuestion (live/LLM path)", () => {
  test("delegates to the LLM, passing the question and profile in the prompt", async () => {
    const complete = vi.fn().mockResolvedValue("A tailored answer.");
    const liveLlm: Llm = { mode: "live", model: "claude-haiku-4-5", complete };

    const res = await answerQuestion(
      { question: "Describe a hard problem you solved.", profile, context: "Backend role" },
      liveLlm,
    );

    expect(res.mode).toBe("live");
    expect(res.answer).toBe("A tailored answer.");
    const prompt = complete.mock.calls[0][0] as string;
    expect(prompt).toContain("Describe a hard problem you solved.");
    expect(prompt).toContain("Ada Lovelace");
    expect(prompt).toContain("Backend role");
  });
});
