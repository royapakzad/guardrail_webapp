import type { ModelOption } from "./types";

export const MODELS: ModelOption[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "OpenAI's flagship multimodal model. Great for demos and quick evaluation.",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    description: "Anthropic's latest Sonnet. Strong reasoning and nuanced instruction-following.",
  },
];

// When Otari is configured, additional models become available at runtime
export const OTARI_MODELS: ModelOption[] = [
  {
    id: "openai/gpt-4o",
    name: "GPT-4o (via Otari)",
    provider: "OpenAI",
    description: "Routed through Otari gateway.",
  },
  {
    id: "anthropic/claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet (via Otari)",
    provider: "Anthropic",
    description: "Routed through Otari gateway.",
  },
  {
    id: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    name: "Llama 3.1 70B (via Otari)",
    provider: "Meta",
    description: "Routed through Otari gateway.",
  },
];

// Guardrail judge models
export const GUARDRAIL_JUDGES: ModelOption[] = [
  {
    id: "gpt-4o-mini",
    name: "GPT-5 Nano (fast)",
    provider: "OpenAI",
    description: "Fast, cost-efficient guardrail judge.",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    description: "Strong policy interpretation.",
  },
];
