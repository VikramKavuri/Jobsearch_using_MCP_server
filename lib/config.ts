// Single source of truth for the real-vs-demo decision. This is the ONLY place
// that reads env to decide whether live AI is available, so the tools never
// branch on environment themselves.

export type Provider = "openai" | "anthropic" | "huggingface" | "demo";

export interface AppConfig {
  mode: "demo" | "live";
  provider: Provider;
  model: string;
  maxTokens: number;
  temperature: number;
  /** Convenience flag === (mode === "live"). */
  liveAiEnabled: boolean;
}

type Env = Record<string, string | undefined>;

/** Provider detection order when LLM_PROVIDER is "auto" (or unset). */
const AUTO_ORDER: { provider: Exclude<Provider, "demo">; keyVar: string }[] = [
  { provider: "anthropic", keyVar: "ANTHROPIC_API_KEY" },
  { provider: "openai", keyVar: "OPENAI_API_KEY" },
  { provider: "huggingface", keyVar: "HF_TOKEN" },
];

const DEFAULT_MODEL: Record<Exclude<Provider, "demo">, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  huggingface: "meta-llama/Llama-3.1-8B-Instruct",
};

const KEY_VAR: Record<Exclude<Provider, "demo">, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  huggingface: "HF_TOKEN",
};

function hasKey(env: Env, varName: string): boolean {
  return Boolean(env[varName] && env[varName]!.trim());
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const requested = (env.LLM_PROVIDER ?? "auto").trim().toLowerCase();

  let provider: Provider = "demo";

  if (requested === "auto" || requested === "") {
    for (const { provider: p, keyVar } of AUTO_ORDER) {
      if (hasKey(env, keyVar)) {
        provider = p;
        break;
      }
    }
  } else if (
    requested === "anthropic" ||
    requested === "openai" ||
    requested === "huggingface"
  ) {
    // Honor an explicit provider only if its key is actually present;
    // otherwise we cannot go live, so degrade to the demo path.
    if (hasKey(env, KEY_VAR[requested])) provider = requested;
  }
  // Any unrecognized value (incl. "demo") leaves provider as "demo".

  const mode: AppConfig["mode"] = provider === "demo" ? "demo" : "live";
  const model =
    env.LLM_MODEL?.trim() ||
    (provider === "demo" ? "demo-template-v1" : DEFAULT_MODEL[provider]);

  return {
    mode,
    provider,
    model,
    maxTokens: num(env.MAX_TOKENS, 600),
    temperature: num(env.TEMPERATURE, 0.7),
    liveAiEnabled: mode === "live",
  };
}
