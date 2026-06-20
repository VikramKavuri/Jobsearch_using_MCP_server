// Provider abstraction. config.ts decides demo-vs-live and the provider;
// this module is the only place that reads the actual API key and performs the
// HTTP call. Tools receive the resulting Llm and never touch env themselves.

import type { AppConfig } from "./config";
import type { Llm } from "./types";

type Env = Record<string, string | undefined>;

interface CompleteOpts {
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

const demoLlm = (config: AppConfig): Llm => ({
  mode: "demo",
  model: config.model,
  // Never invoked by the tools (they branch on mode), but defined so the
  // interface is honored if a caller uses it directly.
  async complete(prompt: string): Promise<string> {
    return `[demo] ${prompt.slice(0, 80)}`;
  },
});

async function callOpenAI(
  apiKey: string,
  config: AppConfig,
  prompt: string,
  opts: CompleteOpts,
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: opts.maxTokens ?? config.maxTokens,
      temperature: opts.temperature ?? config.temperature,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(
  apiKey: string,
  config: AppConfig,
  prompt: string,
  opts: CompleteOpts,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: opts.maxTokens ?? config.maxTokens,
      temperature: opts.temperature ?? config.temperature,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

async function callHuggingFace(
  apiKey: string,
  config: AppConfig,
  prompt: string,
  opts: CompleteOpts,
): Promise<string> {
  // OpenAI-compatible router endpoint.
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: opts.maxTokens ?? config.maxTokens,
      temperature: opts.temperature ?? config.temperature,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HuggingFace error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

const KEY_VAR: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  huggingface: "HF_TOKEN",
};

export function createLlm(config: AppConfig, env: Env = process.env): Llm {
  if (config.mode === "demo" || config.provider === "demo") {
    return demoLlm(config);
  }

  const apiKey = env[KEY_VAR[config.provider]] ?? "";

  return {
    mode: "live",
    model: config.model,
    async complete(prompt: string, opts: CompleteOpts = {}): Promise<string> {
      switch (config.provider) {
        case "openai":
          return callOpenAI(apiKey, config, prompt, opts);
        case "anthropic":
          return callAnthropic(apiKey, config, prompt, opts);
        case "huggingface":
          return callHuggingFace(apiKey, config, prompt, opts);
        default:
          throw new Error(`Unsupported provider: ${config.provider}`);
      }
    },
  };
}
