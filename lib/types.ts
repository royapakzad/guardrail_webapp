export interface Scenario {
  id: string;
  title: string;
  domain: Domain;
  userMessage: string;
  systemPrompt: string;
}

export type Domain =
  | "financial"
  | "humanitarian"
  | "legal"
  | "healthcare"
  | "cybersecurity";

export interface Policy {
  id: string;
  name: string;
  description: string;
  text: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
}

export interface CriterionVerdict {
  criterion: string;
  verdict: "COMPLIANT" | "MINOR_ISSUE" | "MAJOR_ISSUE" | "CRITICAL";
  issues: string[];
  improvements: string[];
  tool_influenced?: boolean;
}

export interface ClaimCheck {
  claim: string;
  status: "verified" | "contradicted" | "unverifiable";
}

export interface GuardrailResult {
  overall_verdict: "PASS" | "FAIL" | "BORDERLINE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  score: number;
  valid: boolean;
  explanation: string;
  criteria_verdicts: CriterionVerdict[];
  improvements_required: string[];
  claim_checks?: ClaimCheck[];
  tool_changed_verdict_for?: string[];
  // agentic-only metadata
  tool_calls_made?: number;
  sources_used?: string[];
  url_checks?: UrlCheck[];
  judgment_time_s?: number;
  total_tokens?: number;
}

export interface UrlCheck {
  url: string;
  valid: boolean;
  status_code: number | null;
  final_url?: string;
  error?: string | null;
}

// SSE event types for streaming agentic evaluation
export type AgenticEvent =
  | { type: "prerun_url"; url: string; valid: boolean; status: number | null }
  | { type: "prerun_acronym"; acronym: string; expansion: string; verdict: string; match: number }
  | { type: "tool_call"; tool: string; args: Record<string, string>; turn: number }
  | { type: "tool_result"; tool: string; result: string; turn: number }
  | { type: "thinking"; text: string }
  | { type: "judgment"; result: GuardrailResult }
  | { type: "error"; message: string };

export interface WizardState {
  step: number;
  // Step 1
  domain: Domain | null;
  scenario: Scenario | null;
  customScenario: string;
  // Step 2
  policy: Policy | null;
  // Step 3
  targetLanguage: string;
  translatedScenario: string;
  // Step 4
  selectedModel: string;
  generatedResponse: string;
  // Step 5
  guardrailMode: "nonagentic" | "agentic" | "both";
  nonAgenticResult: GuardrailResult | null;
  agenticResult: GuardrailResult | null;
  agenticEvents: AgenticEvent[];
}
