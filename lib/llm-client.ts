// Shared LLM client factory — routes to Otari, OpenAI, or Anthropic based on env and model
import OpenAI from "openai";

// GPT-5 family (reasoning models) reject `max_tokens` and non-default `temperature` —
// they require `max_completion_tokens` and only support temperature 1.
export function isGpt5Family(model: string): boolean {
  return model.startsWith("gpt-5");
}

export function completionTokenParams(
  model: string,
  maxTokens: number
):
  | { max_tokens: number; temperature: number }
  | { max_completion_tokens: number; reasoning_effort: "low" } {
  if (isGpt5Family(model)) {
    // Reasoning tokens are billed from the same budget as visible output, so a low
    // reasoning effort keeps enough headroom left for the actual JSON judgment.
    return { max_completion_tokens: maxTokens, reasoning_effort: "low" };
  }
  return { max_tokens: maxTokens, temperature: 0 };
}

export function getOpenAIClient(preferredModel?: string): { client: OpenAI; model: string } {
  const otariKey = process.env.OTARI_API_KEY;
  const otariBase = process.env.OTARI_BASE_URL;
  const openaiKey = process.env.OPENAI_API_KEY;

  const model = preferredModel ?? "gpt-4o-mini";

  // If Otari is fully configured, use it
  if (otariKey && otariBase) {
    return { client: new OpenAI({ apiKey: otariKey, baseURL: otariBase }), model };
  }

  // Fall back to direct OpenAI
  if (!openaiKey) {
    throw new Error(
      "No LLM API key available. Set OPENAI_API_KEY or configure OTARI_API_KEY + OTARI_BASE_URL in .env.local"
    );
  }

  // For non-OpenAI models on direct OpenAI key, downgrade to gpt-4o-mini
  const resolvedModel = model.startsWith("gpt") ? model : "gpt-4o-mini";
  return { client: new OpenAI({ apiKey: openaiKey }), model: resolvedModel };
}
