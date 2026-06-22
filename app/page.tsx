"use client";

import { useState, useCallback } from "react";
import type { Domain, Policy, Scenario, GuardrailResult, AgenticEvent, WizardState } from "@/lib/types";
import { SCENARIOS, DOMAIN_LABELS, DOMAIN_ICONS, DOMAIN_COLORS } from "@/lib/scenarios";
import { POLICIES } from "@/lib/policies";
import { MODELS, GUARDRAIL_JUDGES } from "@/lib/models";

// ── Step indicator ──────────────────────────────────────────────────────────
const STEPS = [
  { n: 1, label: "Scenario" },
  { n: 2, label: "Policy" },
  { n: 3, label: "Translate" },
  { n: 4, label: "Generate" },
  { n: 5, label: "Guardrail" },
];

function StepDot({ step, current, completed }: { step: number; current: number; completed: boolean }) {
  const active = step === current;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all ${
          completed
            ? "bg-indigo-600 border-indigo-600 text-white"
            : active
            ? "bg-white border-indigo-600 text-indigo-600"
            : "bg-white border-slate-300 text-slate-400"
        }`}
      >
        {completed ? "✓" : step}
      </div>
    </div>
  );
}

// ── Verdict badge ───────────────────────────────────────────────────────────
function VerdictBadge({ verdict, score }: { verdict: string; score: number }) {
  const color =
    verdict === "PASS"
      ? "bg-green-100 text-green-800 border-green-300"
      : verdict === "FAIL"
      ? "bg-red-100 text-red-800 border-red-300"
      : "bg-amber-100 text-amber-800 border-amber-300";
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${color}`}>
      {verdict === "PASS" ? "✓" : verdict === "FAIL" ? "✗" : "~"} {verdict}
      <span className="text-xs font-normal opacity-75">({score.toFixed(2)})</span>
    </span>
  );
}

// ── Criterion row ────────────────────────────────────────────────────────────
function verdictStyle(verdict: string): { color: string; label: string } {
  const v = verdict.toLowerCase();
  if (v.includes("compliant") && !v.includes("non") && !v.includes("violation")) {
    return { color: "text-green-700 bg-green-50", label: "Compliant" };
  }
  if (v.includes("minor")) {
    return { color: "text-amber-700 bg-amber-50", label: verdict };
  }
  if (v.includes("major") || v.includes("significant")) {
    return { color: "text-orange-700 bg-orange-50", label: verdict };
  }
  if (v === "minor_issue") return { color: "text-amber-700 bg-amber-50", label: "Minor Issue" };
  if (v === "major_issue") return { color: "text-orange-700 bg-orange-50", label: "Major Issue" };
  // pass/no-issue variants
  if (v.includes("pass") || v.includes("ok") || v.includes("no issue")) {
    return { color: "text-green-700 bg-green-50", label: verdict };
  }
  return { color: "text-red-700 bg-red-50", label: verdict };
}

function CriterionRow({ cv }: { cv: { criterion: string; verdict: string; issues: string[]; improvements: string[]; tool_influenced?: boolean } }) {
  const [open, setOpen] = useState(false);
  const { color, label } = verdictStyle(cv.verdict);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 text-left"
      >
        <div className="flex items-center gap-2">
          {cv.tool_influenced && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">⚡ TOOL</span>
          )}
          <span className="text-sm font-medium text-slate-800">{cv.criterion}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${color}`}>{label}</span>
          <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (cv.issues.length > 0 || cv.improvements.length > 0) && (
        <div className="px-4 py-3 border-t bg-slate-50 space-y-2">
          {cv.issues.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">Issues</p>
              {cv.issues.map((issue, i) => (
                <p key={i} className="text-xs text-slate-700 ml-2">• {issue}</p>
              ))}
            </div>
          )}
          {cv.improvements.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">Suggested improvements</p>
              {cv.improvements.map((imp, i) => (
                <p key={i} className="text-xs text-slate-600 ml-2">→ {imp}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Live agentic streaming panel ─────────────────────────────────────────────
function AgenticStreamPanel({ label, events }: { label?: string; events: AgenticEvent[] }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
      <p className="text-sm font-medium text-blue-700 mb-2">⚡ {label ? `${label} — ` : ""}Agentic evaluation in progress...</p>
      <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
        {events.slice(-8).map((e, i) => {
          if (e.type === "prerun_url") return (
            <p key={i} className="text-xs text-blue-600">🔗 Checking URL: {e.url.slice(0, 60)}... {e.valid ? "✓" : "✗"}</p>
          );
          if (e.type === "prerun_acronym") return (
            <p key={i} className="text-xs text-blue-600">📝 Acronym check: {e.acronym} → {e.verdict}</p>
          );
          if (e.type === "tool_call") return (
            <p key={i} className="text-xs text-blue-600">🔧 {e.tool}: {(e.args.query || e.args.url || "").slice(0, 60)}</p>
          );
          if (e.type === "tool_result") return (
            <p key={i} className="text-xs text-slate-500 ml-4">↳ {e.result.slice(0, 80)}</p>
          );
          return null;
        })}
      </div>
    </div>
  );
}

// ── Reflection questions section ─────────────────────────────────────────────
function ReflectionSection({
  questions,
  answers,
  onChange,
}: {
  questions: { key: string; label: string }[];
  answers: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const answered = questions.filter((q) => (answers[q.key] || "").trim()).length;
  return (
    <div className="border border-amber-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-amber-800">📝 Reflection Questions</span>
          {answered > 0 && (
            <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">
              {answered}/{questions.length} answered
            </span>
          )}
        </div>
        <span className="text-amber-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-4 space-y-4 border-t border-amber-200 bg-amber-50">
          {questions.map((q, i) => (
            <div key={q.key}>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">
                {i + 1}. {q.label}
              </label>
              <textarea
                value={answers[q.key] || ""}
                onChange={(e) => onChange(q.key, e.target.value)}
                placeholder="Your thoughts..."
                className="w-full h-24 text-sm border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none bg-white"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Guardrail result panel ────────────────────────────────────────────────────
function GuardrailPanel({
  label,
  result,
  events,
}: {
  label: string;
  result: GuardrailResult | null;
  events?: AgenticEvent[];
}) {
  const [showExplanation, setShowExplanation] = useState(false);

  if (!result) return null;

  const toolEvents = events?.filter((e) => e.type === "tool_call" || e.type === "tool_result" || e.type === "prerun_url" || e.type === "prerun_acronym") ?? [];

  return (
    <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
      <div className="px-5 py-4 border-b bg-slate-50 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{label}</h3>
        <VerdictBadge verdict={result.overall_verdict} score={result.score} />
      </div>

      <div className="p-5 space-y-4">
        {/* Meta */}
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span>Confidence: <span className="font-medium text-slate-700">{result.confidence}</span></span>
          {result.judgment_time_s !== undefined && (
            <span>Time: <span className="font-medium text-slate-700">{result.judgment_time_s.toFixed(1)}s</span></span>
          )}
          {result.tool_calls_made !== undefined && (
            <span>Tool calls: <span className="font-medium text-slate-700">{result.tool_calls_made}</span></span>
          )}
        </div>

        {/* URL checks */}
        {result.url_checks && result.url_checks.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">URL checks</p>
            <div className="space-y-1">
              {result.url_checks.map((u, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${u.valid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  <span>{u.valid ? "✓" : "✗"}</span>
                  <span className="font-mono truncate max-w-xs">{u.url}</span>
                  <span className="ml-auto">HTTP {u.status_code ?? "?"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Agentic tool timeline */}
        {toolEvents.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Tool activity</p>
            <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
              {toolEvents.map((e, i) => {
                if (e.type === "prerun_url") return (
                  <div key={i} className={`text-xs px-2 py-1 rounded flex gap-2 ${e.valid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    <span>🔗 URL pre-check</span>
                    <span className="font-mono truncate">{e.url}</span>
                    <span className="ml-auto">{e.valid ? "✓" : "✗"} HTTP {e.status}</span>
                  </div>
                );
                if (e.type === "prerun_acronym") return (
                  <div key={i} className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 flex gap-2">
                    <span>📝 Acronym</span>
                    <span className="font-medium">{e.acronym}</span>
                    <span className="text-blue-500">→ {e.verdict} ({Math.round(e.match * 100)}%)</span>
                  </div>
                );
                if (e.type === "tool_call") return (
                  <div key={i} className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700">
                    <span className="font-medium">🔧 {e.tool}</span>
                    {e.args?.query && <span className="text-indigo-500 ml-1">"{e.args.query.slice(0, 60)}"</span>}
                    {e.args?.url && <span className="text-indigo-500 ml-1 font-mono">{e.args.url.slice(0, 60)}</span>}
                  </div>
                );
                if (e.type === "tool_result") return (
                  <div key={i} className="text-xs px-2 py-1 ml-4 rounded bg-slate-50 text-slate-600">
                    ↳ {e.result.slice(0, 120)}
                  </div>
                );
                return null;
              })}
            </div>
          </div>
        )}

        {/* Criteria */}
        {result.criteria_verdicts && result.criteria_verdicts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">Per-criterion verdicts</p>
            {result.criteria_verdicts.map((cv, i) => (
              <CriterionRow key={i} cv={cv} />
            ))}
          </div>
        )}

        {/* Improvements */}
        {result.improvements_required && result.improvements_required.length > 0 && (
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-amber-700 mb-2">Required improvements</p>
            {result.improvements_required.map((imp, i) => (
              <p key={i} className="text-xs text-amber-800 ml-2">→ {imp}</p>
            ))}
          </div>
        )}

        {/* Explanation toggle */}
        <button
          onClick={() => setShowExplanation((v) => !v)}
          className="text-xs text-indigo-600 hover:underline"
        >
          {showExplanation ? "Hide" : "Show"} full explanation
        </button>
        {showExplanation && (
          <pre className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap max-h-64 overflow-y-auto scrollbar-thin">
            {result.explanation}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Submit panel (step 5 reflections + final submission) ─────────────────────
const STEP5_QUESTIONS = [
  {
    key: "agenticDiff",
    label:
      "Inspect the full trace of the guardrail judgments. How do the guardrails differ between agentic and non-agentic judgment?",
  },
  {
    key: "otherTools",
    label: "What other tools would you give an agentic guardrail?",
  },
];

function SubmitPanel({
  scenario,
  policyName,
  policyText,
  model,
  llmResponse,
  llmResponseTranslated,
  targetLanguage,
  nonAgenticResult,
  agenticResult,
  agenticEvents,
  nonAgenticResultTranslated,
  agenticResultTranslated,
  agenticEventsTranslated,
  guardrailMode,
  judgeModel,
  reflections,
  onReflectionChange,
  onSaved,
}: {
  scenario: string;
  policyName: string;
  policyText: string;
  model: string;
  llmResponse: string;
  llmResponseTranslated: string;
  targetLanguage: string;
  nonAgenticResult: GuardrailResult | null;
  agenticResult: GuardrailResult | null;
  agenticEvents: AgenticEvent[];
  nonAgenticResultTranslated: GuardrailResult | null;
  agenticResultTranslated: GuardrailResult | null;
  agenticEventsTranslated: AgenticEvent[];
  guardrailMode: string;
  judgeModel: string;
  reflections: Record<string, string>;
  onReflectionChange: (key: string, val: string) => void;
  onSaved: (ev: SavedEvaluation) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/human-eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluatorName: null,
          scenario,
          policyName,
          policyText,
          model,
          llmResponse,
          nonagenticVerdict: nonAgenticResult?.overall_verdict ?? null,
          nonagenticScore: nonAgenticResult?.score ?? null,
          nonAgenticResult,
          agenticVerdict: agenticResult?.overall_verdict ?? null,
          agenticScore: agenticResult?.score ?? null,
          agenticResult,
          agenticEvents,
          // Translated results (compare mode)
          nonAgenticResultTranslated,
          agenticResultTranslated,
          guardrailMode,
          judgeModel,
          // All reflections
          scenarioPatterns: reflections.scenarioPatterns,
          scenarioChallenges: reflections.scenarioChallenges,
          policyGranularity: reflections.policyGranularity,
          policyScenarioInform: reflections.policyScenarioInform,
          policyEditable: reflections.policyEditable,
          agenticDiff: reflections.agenticDiff,
          otherTools: reflections.otherTools,
          multilingualDiff: reflections.multilingualDiff,
          generalObservations: reflections.generalObservations,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      onSaved({
        id: Date.now().toString(),
        savedAt: new Date(),
        evaluatorName: "",
        scenario,
        policy: policyName,
        policyText,
        model,
        llmResponse,
        llmResponseTranslated,
        targetLanguage,
        guardrailMode,
        judgeModel,
        nonAgenticResult,
        agenticResult,
        agenticEvents,
        nonAgenticResultTranslated,
        agenticResultTranslated,
        agenticEventsTranslated,
        reflections: { ...reflections },
      });
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
        <p className="text-3xl mb-2">✓</p>
        <p className="font-semibold text-green-800">All responses saved!</p>
        <p className="text-sm text-green-600 mt-1">
          Your full report is now available in the Saved Evaluations panel below.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-indigo-100 rounded-xl p-6 space-y-5">
      <div>
        <h3 className="font-semibold text-slate-800">Step 5 Reflection Questions</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Answer these after reviewing the guardrail results above.
        </p>
      </div>

      {STEP5_QUESTIONS.map((q, i) => (
        <div key={q.key}>
          <label className="text-sm font-medium text-slate-700 block mb-1.5">
            {i + 1}. {q.label}
          </label>
          <textarea
            value={reflections[q.key] || ""}
            onChange={(e) => onReflectionChange(q.key, e.target.value)}
            placeholder="Your thoughts..."
            className="w-full h-24 text-sm border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          />
        </div>
      ))}

      <div className="border-t pt-5 space-y-4">
        {submitError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm disabled:opacity-40 hover:bg-indigo-700 flex items-center gap-2 transition-colors"
        >
          {submitting ? (
            <><span className="animate-spin">↻</span> Saving...</>
          ) : (
            "📝 Save All Responses & Generate Report"
          )}
        </button>
      </div>
    </div>
  );
}

// ── Saved evaluation type ────────────────────────────────────────────────────
interface SavedEvaluation {
  id: string;
  savedAt: Date;
  evaluatorName: string;
  scenario: string;
  policy: string;
  policyText: string;
  model: string;
  llmResponse: string;
  llmResponseTranslated: string;
  targetLanguage: string;
  guardrailMode: string;
  judgeModel: string;
  // English results
  nonAgenticResult: GuardrailResult | null;
  agenticResult: GuardrailResult | null;
  agenticEvents: AgenticEvent[];
  // Translated results (when compare mode was used)
  nonAgenticResultTranslated: GuardrailResult | null;
  agenticResultTranslated: GuardrailResult | null;
  agenticEventsTranslated: AgenticEvent[];
  reflections: Record<string, string>;
}

// ── Reflection answer groups for the report ───────────────────────────────────
const REFLECTION_GROUPS = [
  {
    label: "Step 1 — Scenario Selection",
    questions: [
      { key: "scenarioPatterns", label: "What kinds of patterns can you glean from the sample scenarios?" },
      { key: "scenarioChallenges", label: "What challenges did you encounter when choosing or creating a scenario?" },
    ],
  },
  {
    label: "Step 2 — Policy",
    questions: [
      { key: "policyGranularity", label: "Why do you think policies need to be specified so granularly?" },
      { key: "policyScenarioInform", label: "What aspects of the scenario most informed the policy development? What aspects were redundant or overly specific?" },
      { key: "policyEditable", label: "Attempt to edit one of the policies. What makes a component editable?" },
    ],
  },
  {
    label: "Step 5 — Guardrail Judgment",
    questions: [
      { key: "agenticDiff", label: "How do the guardrails differ between agentic and non-agentic judgment?" },
      { key: "otherTools", label: "What other tools would you give an agentic guardrail?" },
    ],
  },
];

// ── Saved evaluation card (full report) ──────────────────────────────────────
function SavedEvaluationCard({ ev, onDelete }: { ev: SavedEvaluation; onDelete: () => void }) {
  const [open, setOpen] = useState(false);

  const hasTranslated = !!(ev.nonAgenticResultTranslated || ev.agenticResultTranslated);

  const enVerdicts = [
    ev.nonAgenticResult && { label: "Non-Agentic", result: ev.nonAgenticResult },
    ev.agenticResult && { label: "Agentic", result: ev.agenticResult },
  ].filter(Boolean) as { label: string; result: GuardrailResult }[];
  const allVerdicts = [
    ...enVerdicts,
    ev.nonAgenticResultTranslated && { label: `Non-Agentic (${ev.targetLanguage})`, result: ev.nonAgenticResultTranslated },
    ev.agenticResultTranslated && { label: `Agentic (${ev.targetLanguage})`, result: ev.agenticResultTranslated },
  ].filter(Boolean) as { label: string; result: GuardrailResult }[];

  const time = ev.savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = ev.savedAt.toLocaleDateString([], { month: "short", day: "numeric" });

  const hasReflections = Object.values(ev.reflections).some((v) => v?.trim());

  // Collect websites from English agentic run
  const collectWebsites = (events: AgenticEvent[], result: GuardrailResult | null) => {
    const urls: string[] = [];
    events.filter((e) => e.type === "tool_call").forEach((e) => {
      if (e.type === "tool_call" && e.args?.url && !urls.includes(e.args.url)) urls.push(e.args.url);
    });
    result?.url_checks?.forEach((u) => { if (!urls.includes(u.url)) urls.push(u.url); });
    return urls;
  };
  const websitesEn = collectWebsites(ev.agenticEvents, ev.agenticResult);
  const websitesTr = collectWebsites(ev.agenticEventsTranslated, ev.agenticResultTranslated);
  const allWebsites = [...websitesEn, ...websitesTr.filter((u) => !websitesEn.includes(u))];

  return (
    <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-4 px-5 py-4 hover:bg-slate-50 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{ev.scenario}</p>
          <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-500">
            <span className="bg-slate-100 px-2 py-0.5 rounded">{ev.policy}</span>
            <span className="bg-slate-100 px-2 py-0.5 rounded">{ev.model}</span>
            <span className="bg-slate-100 px-2 py-0.5 rounded">{ev.guardrailMode}</span>
            <span className="text-slate-400">{date} {time}</span>
            {ev.evaluatorName && <span className="text-slate-500 font-medium">{ev.evaluatorName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {allVerdicts.map(({ label, result }) => (
            <VerdictBadge key={label} verdict={result.overall_verdict} score={result.score} />
          ))}
          <span className="text-slate-400 text-xs ml-1">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t px-5 py-5 space-y-6 bg-slate-50">

          {/* Scenario */}
          <section>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Scenario</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{ev.scenario}</p>
          </section>

          {/* LLM Response */}
          {ev.llmResponse && (
            <section>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                LLM Response · {ev.model}
              </p>
              <div className="bg-white border rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap max-h-60 overflow-y-auto scrollbar-thin">
                {ev.llmResponse}
              </div>
            </section>
          )}

          {/* Policy */}
          {ev.policyText && (
            <section>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                Policy Used · {ev.policy}
              </p>
              <pre className="bg-white border rounded-lg p-4 text-xs text-slate-600 whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">
                {ev.policyText}
              </pre>
            </section>
          )}

          {/* Guardrail judgments — English */}
          {(ev.nonAgenticResult || ev.agenticResult) && (
            <section>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">
                Guardrail Judgments{hasTranslated ? " — English" : ""}
              </p>
              <div className={`grid gap-6 ${enVerdicts.length > 1 ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
                {ev.nonAgenticResult && (
                  <GuardrailPanel label="Non-Agentic" result={ev.nonAgenticResult} />
                )}
                {ev.agenticResult && (
                  <GuardrailPanel label="Agentic" result={ev.agenticResult} events={ev.agenticEvents} />
                )}
              </div>
            </section>
          )}

          {/* Guardrail judgments — Translated */}
          {hasTranslated && (
            <section>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">
                Guardrail Judgments — {ev.targetLanguage}
              </p>
              <div className={`grid gap-6 ${(ev.nonAgenticResultTranslated && ev.agenticResultTranslated) ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
                {ev.nonAgenticResultTranslated && (
                  <GuardrailPanel label="Non-Agentic" result={ev.nonAgenticResultTranslated} />
                )}
                {ev.agenticResultTranslated && (
                  <GuardrailPanel label="Agentic" result={ev.agenticResultTranslated} events={ev.agenticEventsTranslated} />
                )}
              </div>
            </section>
          )}

          {/* Websites used for claim verification */}
          {allWebsites.length > 0 && (
            <section>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                Websites Used for Claim Verification
              </p>
              <div className="space-y-1">
                {allWebsites.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs font-mono text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded transition-colors"
                  >
                    <span className="shrink-0">🔗</span>
                    <span className="truncate">{url}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Reflection answers */}
          {hasReflections && (
            <section>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Reflection Answers</p>
              <div className="space-y-4">
                {REFLECTION_GROUPS.map((group) => {
                  const answered = group.questions.filter((q) => ev.reflections[q.key]?.trim());
                  if (!answered.length) return null;
                  return (
                    <div key={group.label} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-amber-800">{group.label}</p>
                      {answered.map((q) => (
                        <div key={q.key}>
                          <p className="text-xs font-semibold text-slate-500 mb-0.5">{q.label}</p>
                          <p className="text-sm text-slate-700">{ev.reflections[q.key]}</p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Delete this evaluation
          </button>
        </div>
      )}
    </div>
  );
}

// ── Welcome / landing screen ─────────────────────────────────────────────────
function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-10 space-y-8">
        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Guardrails Demo</h1>
          <p className="text-sm text-slate-500">Contextual Evaluation of LLM Guardrails Across Languages and Agentic Systems</p>
        </div>

        {/* Welcome message */}
        <div className="space-y-4 text-slate-700 leading-relaxed">
          <p>
            Thank you for joining our tutorial! As you go through the activity we have designed for
            you, we highly recommend you go through the reflection questions. Your responses will be
            saved and you can access them while your evaluation session is done with the group.
          </p>

          {/* Language encouragement callout */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
            <span className="text-2xl shrink-0">🌐</span>
            <p className="text-sm text-indigo-800">
              If you are confident in using a language other than English, we strongly encourage you
              to conduct the experiment in that language and compare both the LLM response and the
              guardrails judgment in English vs. the other language.
            </p>
          </div>
        </div>

        {/* Enter button */}
        <div className="text-center">
          <button
            onClick={onEnter}
            className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-base hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Start the Tutorial →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main wizard page ────────────────────────────────────────────────────────

const LANGS = [
  "Amharic", "Arabic", "Bengali", "Burmese", "Chinese (Simplified)",
  "Chinese (Traditional)", "Czech", "Dari", "Dutch", "Farsi (Persian)",
  "Filipino (Tagalog)", "French", "German", "Greek", "Gujarati",
  "Hausa", "Hebrew", "Hindi", "Hungarian", "Indonesian", "Italian",
  "Japanese", "Kazakh", "Khmer", "Kinyarwanda", "Korean", "Kurdish (Kurmanji)",
  "Kurdish (Sorani)", "Lingala", "Malay", "Nepali", "Oromo", "Pashto",
  "Polish", "Portuguese", "Punjabi", "Romanian", "Russian", "Serbian",
  "Sinhala", "Somali", "Spanish", "Swahili", "Swedish", "Tamil",
  "Telugu", "Thai", "Tigrinya", "Turkish", "Ukrainian", "Urdu",
  "Uzbek", "Vietnamese", "Zulu",
];

export default function Home() {
  const [state, setState] = useState<WizardState>({
    step: 1,
    domain: null,
    scenario: null,
    customScenario: "",
    policy: null,
    targetLanguage: "French",
    translatedScenario: "",
    selectedModel: "gpt-4o",
    generatedResponse: "",
    generatedResponseTranslated: "",
    guardrailMode: "both",
    nonAgenticResult: null,
    agenticResult: null,
    agenticEvents: [],
    nonAgenticResultTranslated: null,
    agenticResultTranslated: null,
    agenticEventsTranslated: [],
  });

  const [showWelcome, setShowWelcome] = useState(true);
  const [reflections, setReflections] = useState<Record<string, string>>({});
  const updateReflection = (key: string, val: string) =>
    setReflections((r) => ({ ...r, [key]: val }));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [judgeModel, setJudgeModel] = useState("gpt-5-nano");
  const [skipTranslation, setSkipTranslation] = useState(false);
  const [policyEditing, setPolicyEditing] = useState(false);
  const [policyDraft, setPolicyDraft] = useState("");
  const [customUserMsg, setCustomUserMsg] = useState("");
  const [customSysPrompt, setCustomSysPrompt] = useState("");
  // Editable translation draft
  const [translationDraft, setTranslationDraft] = useState("");
  const [translationEditing, setTranslationEditing] = useState(false);
  const [langVersion, setLangVersion] = useState<"original" | "translated" | "compare">("original");
  const [savedEvaluations, setSavedEvaluations] = useState<SavedEvaluation[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  const update = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));

  const originalMessage = state.scenario?.userMessage || customUserMsg;
  const effectiveTranslation = translationDraft || state.translatedScenario;
  const compareLanguages = langVersion === "compare" && !!effectiveTranslation;

  // Active scenario text for single-mode evaluation
  const activeUserMessage =
    langVersion === "translated" && effectiveTranslation
      ? effectiveTranslation
      : originalMessage;
  const activeSysPrompt = state.scenario?.systemPrompt || customSysPrompt;

  // ── Step handlers ────────────────────────────────────────────────────────
  const handleTranslate = useCallback(async () => {
    const text = state.scenario?.userMessage || customUserMsg;
    if (!text) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          targetLanguage: state.targetLanguage,
          systemPrompt: state.scenario?.systemPrompt || customSysPrompt,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      update({ translatedScenario: data.translatedText, step: 4 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setLoading(false);
    }
  }, [state.scenario, state.targetLanguage, customUserMsg, customSysPrompt]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const callGenerate = async (msg: string) => {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: state.selectedModel, systemPrompt: activeSysPrompt, userMessage: msg }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        return data.response as string;
      };

      if (compareLanguages) {
        const [enResponse, translatedResponse] = await Promise.all([
          callGenerate(originalMessage),
          callGenerate(effectiveTranslation),
        ]);
        update({ generatedResponse: enResponse, generatedResponseTranslated: translatedResponse, step: 5 });
      } else {
        const response = await callGenerate(activeUserMessage);
        update({ generatedResponse: response, generatedResponseTranslated: "", step: 5 });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }, [state.selectedModel, activeSysPrompt, activeUserMessage, compareLanguages, originalMessage, effectiveTranslation]);

  const runGuardrailFor = useCallback(async (userMessage: string, response: string, slot: "primary" | "translated") => {
    if (!state.policy || !response) return;
    const evalPayload = {
      policy: policyDraft || state.policy.text,
      systemPrompt: activeSysPrompt,
      userMessage,
      assistantResponse: response,
      judgeModel,
    };

    if (state.guardrailMode === "nonagentic" || state.guardrailMode === "both") {
      const res = await fetch("/api/guardrail/nonagentic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evalPayload),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const result = { ...data.result, judgment_time_s: data.judgment_time_s };
      update(slot === "primary" ? { nonAgenticResult: result } : { nonAgenticResultTranslated: result });
    }

    if (state.guardrailMode === "agentic" || state.guardrailMode === "both") {
      const agEvents: AgenticEvent[] = [];
      const res = await fetch("/api/guardrail/agentic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evalPayload),
      });

      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event: AgenticEvent = JSON.parse(line.slice(6));
            agEvents.push(event);
            if (event.type === "judgment") {
              update(
                slot === "primary"
                  ? { agenticResult: event.result, agenticEvents: [...agEvents] }
                  : { agenticResultTranslated: event.result, agenticEventsTranslated: [...agEvents] }
              );
            } else {
              update(slot === "primary" ? { agenticEvents: [...agEvents] } : { agenticEventsTranslated: [...agEvents] });
            }
          } catch {}
        }
      }
    }
  }, [state.policy, state.guardrailMode, policyDraft, activeSysPrompt, judgeModel]);

  const handleEvaluate = useCallback(async () => {
    if (!state.policy || !state.generatedResponse) return;
    setLoading(true);
    setError(null);
    update({
      nonAgenticResult: null, agenticResult: null, agenticEvents: [],
      nonAgenticResultTranslated: null, agenticResultTranslated: null, agenticEventsTranslated: [],
    });

    try {
      if (compareLanguages && state.generatedResponseTranslated) {
        await Promise.all([
          runGuardrailFor(originalMessage, state.generatedResponse, "primary"),
          runGuardrailFor(effectiveTranslation, state.generatedResponseTranslated, "translated"),
        ]);
      } else {
        await runGuardrailFor(activeUserMessage, state.generatedResponse, "primary");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setLoading(false);
    }
  }, [state.policy, state.generatedResponse, state.generatedResponseTranslated, compareLanguages, originalMessage, effectiveTranslation, activeUserMessage, runGuardrailFor]);

  const handleNewScenario = useCallback(() => {
    setState({
      step: 1, domain: null, scenario: null, customScenario: "",
      policy: null, targetLanguage: "French", translatedScenario: "",
      selectedModel: "gpt-4o", generatedResponse: "", generatedResponseTranslated: "",
      guardrailMode: "both", nonAgenticResult: null, agenticResult: null, agenticEvents: [],
      nonAgenticResultTranslated: null, agenticResultTranslated: null, agenticEventsTranslated: [],
    });
    setCustomUserMsg(""); setCustomSysPrompt(""); setSkipTranslation(false); setLangVersion("original"); setReflections({});
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const domainList: Domain[] = ["financial", "humanitarian", "legal", "healthcare", "cybersecurity"];

  if (showWelcome) {
    return <WelcomeScreen onEnter={() => setShowWelcome(false)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900">Guardrails Demo</h1>
              <p className="text-xs text-slate-500">Contextual Evaluation of LLM Guardrails Across Languages and Agentic Systems</p>
            </div>
            {savedEvaluations.length > 0 && (
              <button
                onClick={() => { setShowSaved(true); document.getElementById("saved-panel")?.scrollIntoView({ behavior: "smooth" }); }}
                className="flex items-center gap-1.5 text-xs text-slate-600 border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
              >
                📋 <span className="font-medium">{savedEvaluations.length} saved</span>
              </button>
            )}
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center">
                <button
                  onClick={() => state.step > s.n && update({ step: s.n })}
                  className={`flex flex-col items-center ${state.step > s.n ? "cursor-pointer" : "cursor-default"}`}
                >
                  <StepDot step={s.n} current={state.step} completed={state.step > s.n} />
                  <span className={`text-xs mt-0.5 hidden sm:block ${state.step === s.n ? "text-indigo-600 font-medium" : "text-slate-400"}`}>{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 mx-1 ${state.step > s.n ? "bg-indigo-600" : "bg-slate-200"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <span>⚠️</span>
            <div>
              <p className="font-medium">Error</p>
              <p>{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* ── STEP 1: SCENARIO ─────────────────────────────────────────── */}
        {state.step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Step 1: Choose a Scenario</h2>
              <p className="text-sm text-slate-500 mt-1">Select a domain and scenario, or enter a custom one.</p>
            </div>

            {/* Domain tabs */}
            <div className="flex flex-wrap gap-2">
              {domainList.map((d) => (
                <button
                  key={d}
                  onClick={() => update({ domain: d })}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                    state.domain === d
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                  }`}
                >
                  {DOMAIN_ICONS[d]} {DOMAIN_LABELS[d]}
                </button>
              ))}
            </div>

            {/* Scenario cards */}
            {state.domain && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SCENARIOS.filter((s) => s.domain === state.domain).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => update({ scenario: s, customScenario: "" })}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      state.scenario?.id === s.id
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 bg-white hover:border-indigo-300"
                    }`}
                  >
                    <p className="font-medium text-slate-800 mb-2">{s.title}</p>
                    <p className="text-sm text-slate-500">{s.userMessage}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Custom scenario */}
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Or write / upload a custom scenario</p>
                <label className="flex items-center gap-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-indigo-50 transition-colors">
                  📂 Upload .txt / .md
                  <input
                    type="file"
                    accept=".txt,.md"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const text = (ev.target?.result as string) || "";
                        setCustomUserMsg(text);
                        update({ scenario: null });
                      };
                      reader.readAsText(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <textarea
                value={customUserMsg}
                onChange={(e) => {
                  setCustomUserMsg(e.target.value);
                  if (e.target.value) update({ scenario: null });
                }}
                placeholder="Enter a user message to evaluate, or upload a .txt / .md file above..."
                className="w-full h-28 text-sm border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
              <textarea
                value={customSysPrompt}
                onChange={(e) => setCustomSysPrompt(e.target.value)}
                placeholder="(Optional) System prompt for the LLM..."
                className="w-full h-16 text-sm border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none text-slate-500"
              />
            </div>

            <ReflectionSection
              questions={[
                { key: "scenarioPatterns", label: "What kinds of patterns can you glean from the sample scenarios?" },
                { key: "scenarioChallenges", label: "What challenges did you encounter when choosing or creating a scenario?" },
              ]}
              answers={reflections}
              onChange={updateReflection}
            />

            <button
              disabled={!state.scenario && !customUserMsg}
              onClick={() => update({ step: 2 })}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm disabled:opacity-40 hover:bg-indigo-700 transition-colors"
            >
              Continue → Choose Policy
            </button>
          </div>
        )}

        {/* ── STEP 2: POLICY ───────────────────────────────────────────── */}
        {state.step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Step 2: Choose a Policy</h2>
              <p className="text-sm text-slate-500 mt-1">The guardrail will evaluate the response against this policy.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {POLICIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { update({ policy: p }); setPolicyDraft(""); setPolicyEditing(false); }}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    state.policy?.id === p.id
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-indigo-300"
                  }`}
                >
                  <p className="font-medium text-slate-800 mb-1">{p.name}</p>
                  <p className="text-sm text-slate-500">{p.description}</p>
                </button>
              ))}

              {/* Upload custom policy card */}
              <label className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                state.policy?.id === "custom-upload"
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50"
              }`}>
                <span className="text-2xl">📄</span>
                <p className="font-medium text-slate-700 text-sm">Upload your own policy</p>
                <p className="text-xs text-slate-400 text-center">Accepts .txt or .md files</p>
                <input
                  type="file"
                  accept=".txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const text = (ev.target?.result as string) || "";
                      const customPolicy = {
                        id: "custom-upload",
                        name: file.name.replace(/\.[^.]+$/, ""),
                        description: "Uploaded custom policy",
                        text,
                      };
                      update({ policy: customPolicy });
                      setPolicyDraft(text);
                      setPolicyEditing(false);
                    };
                    reader.readAsText(file);
                    e.target.value = "";
                  }}
                />
              </label>

              {/* Write custom policy card */}
              <button
                onClick={() => {
                  const customPolicy = {
                    id: "custom-written",
                    name: "Custom Policy",
                    description: "Hand-written custom policy",
                    text: "",
                  };
                  update({ policy: customPolicy });
                  setPolicyDraft("");
                  setPolicyEditing(true);
                }}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed transition-all ${
                  state.policy?.id === "custom-written"
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50"
                }`}
              >
                <span className="text-2xl">✏️</span>
                <p className="font-medium text-slate-700 text-sm">Write your own policy</p>
                <p className="text-xs text-slate-400 text-center">Type a custom policy from scratch</p>
              </button>
            </div>

            {/* Policy preview / editor */}
            {state.policy && (
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-700">Policy text</span>
                  <div className="flex items-center gap-2">
                    {policyEditing && policyDraft !== (state.policy?.text ?? "") && (
                      <button
                        onClick={() => { setPolicyDraft(state.policy?.text ?? ""); }}
                        className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 border rounded-lg"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (!policyEditing) setPolicyDraft(policyDraft || state.policy?.text || "");
                        setPolicyEditing((v) => !v);
                      }}
                      className={`text-xs px-3 py-1 rounded-lg border font-medium transition-colors ${
                        policyEditing
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"
                      }`}
                    >
                      {policyEditing ? "✓ Done editing" : "✏️ Edit"}
                    </button>
                  </div>
                </div>
                {policyEditing ? (
                  <textarea
                    value={policyDraft}
                    onChange={(e) => setPolicyDraft(e.target.value)}
                    placeholder="Write your policy here — describe what the assistant must not do, and any other rules the guardrail should enforce..."
                    className="w-full text-xs text-slate-700 font-mono border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y min-h-48 max-h-96 scrollbar-thin"
                    spellCheck={false}
                  />
                ) : (
                  <pre className="text-xs text-slate-600 whitespace-pre-wrap max-h-64 overflow-y-auto scrollbar-thin">
                    {policyDraft || state.policy.text}
                  </pre>
                )}
                {policyDraft && policyDraft !== state.policy.text && !policyEditing && (
                  <p className="mt-2 text-xs text-indigo-600 font-medium">✏️ Policy has been edited — your custom version will be used for evaluation.</p>
                )}
              </div>
            )}

            <ReflectionSection
              questions={[
                { key: "policyGranularity", label: "Why do you think policies need to be specified so granularly?" },
                { key: "policyScenarioInform", label: "If you tried to develop your own scenario, what aspects of the scenario most informed the policy development? What aspects were redundant or overly specific?" },
                { key: "policyEditable", label: "Attempt to edit one of the policies. What makes a component editable?" },
              ]}
              answers={reflections}
              onChange={updateReflection}
            />

            <div className="flex gap-3">
              <button onClick={() => update({ step: 1 })} className="px-4 py-2.5 border rounded-lg text-sm text-slate-600 hover:bg-slate-50">← Back</button>
              <button
                disabled={!state.policy || !(policyDraft || state.policy.text).trim()}
                onClick={() => update({ step: 3 })}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm disabled:opacity-40 hover:bg-indigo-700"
              >
                Continue → Translate
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: TRANSLATE ────────────────────────────────────────── */}
        {state.step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Step 3: Translate (Optional)</h2>
              <p className="text-sm text-slate-500 mt-1">
                Translate your scenario to another language using Gemini 2.5 Flash to test multilingual guardrail behavior.
              </p>
            </div>

            {/* Original */}
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs font-semibold text-slate-500 mb-2">Original scenario</p>
              <p className="text-sm text-slate-700">{state.scenario?.userMessage || customUserMsg}</p>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-700">Target language:</label>
              <select
                value={state.targetLanguage}
                onChange={(e) => update({ targetLanguage: e.target.value })}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {LANGS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <button
                onClick={handleTranslate}
                disabled={loading}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-indigo-700 flex items-center gap-2"
              >
                {loading ? <span className="animate-spin">↻</span> : "🌐"} Translate with Gemini 2.5 Flash
              </button>
            </div>

            {state.translatedScenario && (
              <div className="bg-white rounded-xl border border-indigo-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-indigo-600">Translated ({state.targetLanguage})</p>
                  <button
                    onClick={() => {
                      if (!translationEditing) setTranslationDraft(translationDraft || state.translatedScenario);
                      setTranslationEditing((v) => !v);
                    }}
                    className={`text-xs px-3 py-1 rounded-lg border font-medium transition-colors ${
                      translationEditing
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"
                    }`}
                  >
                    {translationEditing ? "✓ Done" : "✏️ Edit"}
                  </button>
                </div>
                {translationEditing ? (
                  <textarea
                    value={translationDraft || state.translatedScenario}
                    onChange={(e) => setTranslationDraft(e.target.value)}
                    className="w-full text-sm text-slate-700 border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y min-h-24 scrollbar-thin"
                  />
                ) : (
                  <p className="text-sm text-slate-700">{translationDraft || state.translatedScenario}</p>
                )}
                {translationDraft && translationDraft !== state.translatedScenario && !translationEditing && (
                  <p className="mt-1.5 text-xs text-indigo-600">✏️ Edited version will be used</p>
                )}
              </div>
            )}

            <div className="flex gap-3 items-center flex-wrap">
              <button onClick={() => update({ step: 2 })} className="px-4 py-2.5 border rounded-lg text-sm text-slate-600 hover:bg-slate-50">← Back</button>
              <button
                onClick={() => { setSkipTranslation(true); update({ step: 4 }); }}
                className="px-4 py-2.5 border rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                Skip translation
              </button>
              {state.translatedScenario && (
                <button
                  onClick={() => update({ step: 4 })}
                  className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700"
                >
                  Continue → Generate
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 4: GENERATE ─────────────────────────────────────────── */}
        {state.step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Step 4: Generate Response</h2>
              <p className="text-sm text-slate-500 mt-1">Choose a model to generate a response to your scenario.</p>
            </div>

            {/* Language version selector */}
            {effectiveTranslation && (
              <div className="bg-white rounded-xl border p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500">Which version should the model respond to?</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: "original" as const, label: "🇬🇧 English (original)" },
                    { v: "translated" as const, label: `🌐 ${state.targetLanguage} (translated)` },
                    { v: "compare" as const, label: `⚖️ Compare both` },
                  ].map(({ v, label }) => (
                    <button
                      key={v}
                      onClick={() => setLangVersion(v)}
                      className={`px-4 py-2 rounded-lg text-sm border font-medium transition-all ${
                        langVersion === v
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
                  {langVersion === "original" && "The model will receive and respond to the original English scenario."}
                  {langVersion === "translated" && `The model will receive and respond to the ${state.targetLanguage} translation.`}
                  {langVersion === "compare" && `The model will generate a response for both the English original and the ${state.targetLanguage} translation, so you can compare how the guardrail judges each.`}
                </p>
              </div>
            )}

            {/* Scenario preview */}
            {compareLanguages ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2">🇬🇧 Scenario (English)</p>
                  <p className="text-sm text-slate-700">{originalMessage}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2">🌐 Scenario ({state.targetLanguage})</p>
                  <p className="text-sm text-slate-700">{effectiveTranslation}</p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">Scenario</p>
                <p className="text-sm text-slate-700">{activeUserMessage}</p>
              </div>
            )}

            {/* Model selector */}
            <div className="grid grid-cols-1 gap-3 max-w-xs">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => update({ selectedModel: m.id })}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    state.selectedModel === m.id
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-indigo-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-800">{m.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{m.provider}</p>
                </button>
              ))}
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm disabled:opacity-50 hover:bg-indigo-700 flex items-center gap-2"
            >
              {loading
                ? <><span className="animate-spin">↻</span> Generating...</>
                : compareLanguages ? "⚡ Generate Both Responses" : "⚡ Generate Response"}
            </button>

            {state.generatedResponse && (
              <div className="space-y-3">
                {compareLanguages ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-white rounded-xl border p-4">
                      <p className="text-xs font-semibold text-slate-500 mb-2">
                        🇬🇧 Response (English) · {MODELS.find((m) => m.id === state.selectedModel)?.name}
                      </p>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap max-h-80 overflow-y-auto scrollbar-thin">
                        {state.generatedResponse}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border p-4">
                      <p className="text-xs font-semibold text-slate-500 mb-2">
                        🌐 Response ({state.targetLanguage}) · {MODELS.find((m) => m.id === state.selectedModel)?.name}
                      </p>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap max-h-80 overflow-y-auto scrollbar-thin">
                        {state.generatedResponseTranslated}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2">
                      Response from {MODELS.find((m) => m.id === state.selectedModel)?.name}
                    </p>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap max-h-80 overflow-y-auto scrollbar-thin">
                      {state.generatedResponse}
                    </div>
                  </div>
                )}
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
                  <span className="text-xl">✓</span>
                  <div>
                    <p className="text-sm font-semibold text-indigo-800">Ready to evaluate</p>
                    <p className="text-sm text-indigo-700 mt-0.5">
                      Based on the selected <strong>{state.policy?.name}</strong>, you can now run a guardrail evaluation
                      {compareLanguages
                        ? ` to compare how compliant the English and ${state.targetLanguage} responses are with your policy.`
                        : " to see how compliant this response is with your policy."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => update({ step: 3 })} className="px-4 py-2.5 border rounded-lg text-sm text-slate-600 hover:bg-slate-50">← Back</button>
              {state.generatedResponse && (
                <button
                  onClick={() => update({ step: 5 })}
                  className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700"
                >
                  Continue → Guardrail
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 5: GUARDRAIL ────────────────────────────────────────── */}
        {state.step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Step 5: Guardrail Evaluation</h2>
              <p className="text-sm text-slate-500 mt-1">
                Based on the selected <strong>{state.policy?.name}</strong>,
                {compareLanguages
                  ? ` run a guardrail to compare how compliant the English and ${state.targetLanguage} responses are with your policy.`
                  : " run a guardrail to see how compliant the model's answer is with your policy."}
              </p>
            </div>

            {/* Scenario + response recap */}
            {compareLanguages ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2">🇬🇧 Scenario (English)</p>
                    <p className="text-sm text-slate-700">{originalMessage}</p>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2">
                      🇬🇧 Model response · {MODELS.find((m) => m.id === state.selectedModel)?.name}
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{state.generatedResponse}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2">🌐 Scenario ({state.targetLanguage})</p>
                    <p className="text-sm text-slate-700">{effectiveTranslation}</p>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2">
                      🌐 Model response · {MODELS.find((m) => m.id === state.selectedModel)?.name}
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{state.generatedResponseTranslated}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Scenario</p>
                  <p className="text-sm text-slate-700">{activeUserMessage}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2">
                    Model response · {MODELS.find((m) => m.id === state.selectedModel)?.name}
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{state.generatedResponse}</p>
                </div>
              </div>
            )}

            {/* Options */}
            <div className="bg-white rounded-xl border p-4 space-y-4">
              <div className="flex flex-wrap gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Guardrail mode</p>
                  <div className="flex gap-2">
                    {(["nonagentic", "agentic", "both"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => update({ guardrailMode: m })}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                          state.guardrailMode === m
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                        }`}
                      >
                        {m === "nonagentic" ? "🔍 Non-agentic" : m === "agentic" ? "⚡ Agentic" : "📊 Both"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Judge model</p>
                  <select
                    value={judgeModel}
                    onChange={(e) => setJudgeModel(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    {GUARDRAIL_JUDGES.map((j) => (
                      <option key={j.id} value={j.id}>{j.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-1">
                <p><strong>Non-agentic:</strong> Judges the response using the policy text alone — no external tools.</p>
                <p><strong>Agentic:</strong> Uses web search, URL validation, and acronym checking to verify factual claims. Shows live tool activity.</p>
              </div>
            </div>

            <button
              onClick={handleEvaluate}
              disabled={loading}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm disabled:opacity-50 hover:bg-indigo-700 flex items-center gap-2"
            >
              {loading ? <><span className="animate-spin">↻</span> Evaluating...</> : "Run Guardrail Evaluation"}
            </button>

            {/* Live streaming indicator */}
            {loading && state.guardrailMode !== "nonagentic" && (
              <div className={`grid gap-3 ${compareLanguages ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
                <AgenticStreamPanel label={compareLanguages ? "🇬🇧 English" : undefined} events={state.agenticEvents} />
                {compareLanguages && (
                  <AgenticStreamPanel label={`🌐 ${state.targetLanguage}`} events={state.agenticEventsTranslated} />
                )}
              </div>
            )}

            {/* Results */}
            {(state.nonAgenticResult || state.agenticResult || state.nonAgenticResultTranslated || state.agenticResultTranslated) && (
              <>
                {compareLanguages ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <p className="text-sm font-bold text-slate-600">🇬🇧 English</p>
                      {state.nonAgenticResult && (
                        <GuardrailPanel label="🔍 Non-Agentic Evaluation" result={state.nonAgenticResult} />
                      )}
                      {state.agenticResult && (
                        <GuardrailPanel label="⚡ Agentic Evaluation" result={state.agenticResult} events={state.agenticEvents} />
                      )}
                    </div>
                    <div className="space-y-4">
                      <p className="text-sm font-bold text-slate-600">🌐 {state.targetLanguage}</p>
                      {state.nonAgenticResultTranslated && (
                        <GuardrailPanel label="🔍 Non-Agentic Evaluation" result={state.nonAgenticResultTranslated} />
                      )}
                      {state.agenticResultTranslated && (
                        <GuardrailPanel label="⚡ Agentic Evaluation" result={state.agenticResultTranslated} events={state.agenticEventsTranslated} />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={`grid gap-6 ${state.guardrailMode === "both" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
                    {state.nonAgenticResult && (
                      <GuardrailPanel label="🔍 Non-Agentic Evaluation" result={state.nonAgenticResult} />
                    )}
                    {state.agenticResult && (
                      <GuardrailPanel
                        label="⚡ Agentic Evaluation"
                        result={state.agenticResult}
                        events={state.agenticEvents}
                      />
                    )}
                  </div>
                )}

                {/* Submit panel — step 5 reflections + final save */}
                <div className="border-t pt-6">
                  <SubmitPanel
                    scenario={activeUserMessage}
                    policyName={state.policy?.name ?? "Unknown"}
                    policyText={policyDraft || (state.policy?.text ?? "")}
                    model={MODELS.find((m) => m.id === state.selectedModel)?.name ?? state.selectedModel}
                    llmResponse={state.generatedResponse}
                    llmResponseTranslated={state.generatedResponseTranslated}
                    targetLanguage={state.targetLanguage}
                    nonAgenticResult={state.nonAgenticResult}
                    agenticResult={state.agenticResult}
                    agenticEvents={state.agenticEvents}
                    nonAgenticResultTranslated={state.nonAgenticResultTranslated}
                    agenticResultTranslated={state.agenticResultTranslated}
                    agenticEventsTranslated={state.agenticEventsTranslated}
                    guardrailMode={state.guardrailMode}
                    judgeModel={judgeModel}
                    reflections={reflections}
                    onReflectionChange={updateReflection}
                    onSaved={(ev) => { setSavedEvaluations((prev) => [ev, ...prev]); setShowSaved(true); }}
                  />
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button onClick={() => update({ step: 4 })} className="px-4 py-2.5 border rounded-lg text-sm text-slate-600 hover:bg-slate-50">← Back</button>
              <button
                onClick={handleNewScenario}
                className="px-4 py-2.5 border rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                ✦ New Scenario
              </button>
            </div>
          </div>
        )}

        {/* ── SAVED EVALUATIONS ──────────────────────────────────────────── */}
        {savedEvaluations.length > 0 && (
          <div id="saved-panel" className="border-t pt-8">
            <button
              onClick={() => setShowSaved((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors"
            >
              <span>📋 Saved Evaluations</span>
              <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {savedEvaluations.length}
              </span>
              <span className="text-slate-400 text-xs ml-1">{showSaved ? "▲" : "▼"}</span>
            </button>

            {showSaved && (
              <div className="mt-4 space-y-3">
                {savedEvaluations.map((ev) => (
                  <SavedEvaluationCard
                    key={ev.id}
                    ev={ev}
                    onDelete={() => setSavedEvaluations((prev) => prev.filter((e) => e.id !== ev.id))}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
