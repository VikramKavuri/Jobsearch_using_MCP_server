import { describe, expect, test } from "vitest";
import { createLlm } from "./llm";
import { loadConfig } from "./config";

describe("createLlm", () => {
  test("returns a demo LLM when config is in demo mode (no network)", async () => {
    const llm = createLlm(loadConfig({}));
    expect(llm.mode).toBe("demo");
    const out = await llm.complete("hello");
    expect(typeof out).toBe("string");
  });

  test("returns a live LLM carrying provider model when a key is present", () => {
    const cfg = loadConfig({ OPENAI_API_KEY: "sk-xxx", LLM_MODEL: "gpt-4.1" });
    const llm = createLlm(cfg, { OPENAI_API_KEY: "sk-xxx" });
    expect(llm.mode).toBe("live");
    expect(llm.model).toBe("gpt-4.1");
  });

  test("wires up Groq with its default model when GROQ_API_KEY is set", () => {
    const cfg = loadConfig({ GROQ_API_KEY: "gsk_xxx" });
    const llm = createLlm(cfg, { GROQ_API_KEY: "gsk_xxx" });
    expect(llm.mode).toBe("live");
    expect(llm.model).toMatch(/llama/);
  });
});
