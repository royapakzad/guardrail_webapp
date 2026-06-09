// Shared LLM client factory — routes to Otari, OpenAI, or Anthropic based on env and model
import OpenAI from "openai";

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
