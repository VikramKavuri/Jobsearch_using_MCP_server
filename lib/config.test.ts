import { describe, expect, test } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  test("defaults to demo mode with no keys present", () => {
    const cfg = loadConfig({});
    expect(cfg.mode).toBe("demo");
    expect(cfg.provider).toBe("demo");
    expect(cfg.liveAiEnabled).toBe(false);
  });

  test("auto-detects Anthropic when ANTHROPIC_API_KEY is set", () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: "sk-ant-xxx" });
    expect(cfg.mode).toBe("live");
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.model).toMatch(/claude/);
  });

  test("auto-detects OpenAI when only OPENAI_API_KEY is set", () => {
    const cfg = loadConfig({ OPENAI_API_KEY: "sk-xxx" });
    expect(cfg.provider).toBe("openai");
    expect(cfg.mode).toBe("live");
  });

  test("prefers Anthropic over OpenAI when both keys are present (auto)", () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: "sk-ant-xxx",
      OPENAI_API_KEY: "sk-xxx",
    });
    expect(cfg.provider).toBe("anthropic");
  });

  test("honors an explicit LLM_PROVIDER when its key is present", () => {
    const cfg = loadConfig({
      LLM_PROVIDER: "openai",
      ANTHROPIC_API_KEY: "sk-ant-xxx",
      OPENAI_API_KEY: "sk-xxx",
    });
    expect(cfg.provider).toBe("openai");
  });

  test("falls back to demo when an explicit provider has no key", () => {
    const cfg = loadConfig({ LLM_PROVIDER: "anthropic" });
    expect(cfg.mode).toBe("demo");
    expect(cfg.provider).toBe("demo");
  });

  test("applies MAX_TOKENS, TEMPERATURE and LLM_MODEL overrides", () => {
    const cfg = loadConfig({
      OPENAI_API_KEY: "sk-xxx",
      LLM_MODEL: "gpt-4.1",
      MAX_TOKENS: "1234",
      TEMPERATURE: "0.2",
    });
    expect(cfg.model).toBe("gpt-4.1");
    expect(cfg.maxTokens).toBe(1234);
    expect(cfg.temperature).toBeCloseTo(0.2, 5);
  });

  test("uses safe numeric defaults when overrides are absent or invalid", () => {
    const cfg = loadConfig({ MAX_TOKENS: "not-a-number" });
    expect(cfg.maxTokens).toBeGreaterThan(0);
    expect(cfg.temperature).toBeGreaterThanOrEqual(0);
  });
});
