import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

interface WorkshopResponse {
  id: number;
  created_at: string;
  evaluator_name: string | null;
  scenario: string;
  policy_name: string;
  policy_text: string | null;
  model: string | null;
  llm_response: string | null;
  nonagentic_verdict: string | null;
  nonagentic_score: number | null;
  nonagentic_result: Record<string, unknown> | null;
  agentic_verdict: string | null;
  agentic_score: number | null;
  agentic_result: Record<string, unknown> | null;
  agentic_events: unknown[] | null;
  guardrail_mode: string | null;
  judge_model: string | null;
  // Step 1 reflections
  scenario_patterns: string | null;
  scenario_challenges: string | null;
  // Step 2 reflections
  policy_granularity: string | null;
  policy_scenario_inform: string | null;
  policy_editable: string | null;
  // Step 5 reflections
  agentic_diff: string | null;
  other_tools: string | null;
  multilingual_diff: string | null;
  general_observations: string | null;
}

function VerdictChip({ v, score }: { v: string | null; score?: number | null }) {
  if (!v) return null;
  const color =
    v === "PASS"
      ? "bg-green-100 text-green-700"
      : v === "FAIL"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {v}
      {score != null && <span className="font-normal opacity-70 ml-1">({score.toFixed(2)})</span>}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function ReflectionGroup({
  label,
  fields,
}: {
  label: string;
  fields: { q: string; a: string | null }[];
}) {
  const answered = fields.filter((f) => f.a?.trim());
  if (!answered.length) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-amber-800">{label}</p>
      {answered.map((f, i) => (
        <div key={i}>
          <p className="text-xs font-semibold text-slate-500 mb-0.5">{f.q}</p>
          <p className="text-sm text-slate-700">{f.a}</p>
        </div>
      ))}
    </div>
  );
}

export default async function AdminPage() {
  let responses: WorkshopResponse[] = [];
  let dbError: string | null = null;

  try {
    const { rows } = await sql<WorkshopResponse>`
      SELECT * FROM workshop_responses ORDER BY created_at DESC
    `;
    responses = rows;
  } catch {
    dbError =
      "Database not connected. Set up Vercel Postgres in your project's Storage tab, then redeploy.";
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workshop Responses</h1>
          <p className="text-slate-500 mt-1">
            {responses.length} evaluation{responses.length !== 1 ? "s" : ""} submitted
          </p>
        </div>

        {dbError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
            {dbError}
          </div>
        )}

        {responses.length === 0 && !dbError && (
          <p className="text-slate-400 text-sm">No submissions yet.</p>
        )}

        <div className="space-y-8">
          {responses.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b bg-slate-50 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-slate-800">
                    {r.evaluator_name ?? (
                      <span className="text-slate-400 font-normal italic">Anonymous</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(r.created_at).toLocaleString()} · {r.policy_name}
                    {r.model && <> · {r.model}</>}
                    {r.judge_model && <> · judge: {r.judge_model}</>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {r.nonagentic_verdict && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      Non-agentic: <VerdictChip v={r.nonagentic_verdict} score={r.nonagentic_score} />
                    </span>
                  )}
                  {r.agentic_verdict && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      Agentic: <VerdictChip v={r.agentic_verdict} score={r.agentic_score} />
                    </span>
                  )}
                </div>
              </div>

              <div className="px-5 py-5 space-y-5">
                {/* Scenario */}
                <Field label="Scenario" value={r.scenario} />

                {/* LLM Response */}
                {r.llm_response && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      LLM Response · {r.model}
                    </p>
                    <div className="bg-slate-50 border rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {r.llm_response}
                    </div>
                  </div>
                )}

                {/* Policy text */}
                {r.policy_text && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      Policy · {r.policy_name}
                    </p>
                    <pre className="bg-slate-50 border rounded-lg p-3 text-xs text-slate-600 whitespace-pre-wrap max-h-36 overflow-y-auto">
                      {r.policy_text}
                    </pre>
                  </div>
                )}

                {/* Guardrail detail */}
                {(r.nonagentic_result || r.agentic_result) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {r.nonagentic_result && (
                      <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
                        <p className="font-semibold text-slate-600 mb-1">Non-Agentic detail</p>
                        <p className="text-slate-500">
                          Confidence:{" "}
                          <span className="font-medium text-slate-700">
                            {String(r.nonagentic_result.confidence ?? "—")}
                          </span>
                        </p>
                        {Array.isArray(r.nonagentic_result.improvements_required) &&
                          r.nonagentic_result.improvements_required.length > 0 && (
                            <div>
                              <p className="font-semibold text-slate-500 mt-1">Required improvements</p>
                              {(r.nonagentic_result.improvements_required as string[]).map((imp, i) => (
                                <p key={i} className="text-slate-600 ml-2">→ {imp}</p>
                              ))}
                            </div>
                          )}
                      </div>
                    )}
                    {r.agentic_result && (
                      <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
                        <p className="font-semibold text-slate-600 mb-1">Agentic detail</p>
                        <p className="text-slate-500">
                          Confidence:{" "}
                          <span className="font-medium text-slate-700">
                            {String(r.agentic_result.confidence ?? "—")}
                          </span>
                        </p>
                        {r.agentic_result.tool_calls_made != null && (
                          <p className="text-slate-500">
                            Tool calls:{" "}
                            <span className="font-medium text-slate-700">
                              {String(r.agentic_result.tool_calls_made)}
                            </span>
                          </p>
                        )}
                        {Array.isArray(r.agentic_result.improvements_required) &&
                          r.agentic_result.improvements_required.length > 0 && (
                            <div>
                              <p className="font-semibold text-slate-500 mt-1">Required improvements</p>
                              {(r.agentic_result.improvements_required as string[]).map((imp, i) => (
                                <p key={i} className="text-slate-600 ml-2">→ {imp}</p>
                              ))}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}

                {/* Reflection answers */}
                <ReflectionGroup
                  label="Step 1 — Scenario Selection"
                  fields={[
                    { q: "What kinds of patterns can you glean from the sample scenarios?", a: r.scenario_patterns },
                    { q: "What challenges did you encounter when choosing or creating a scenario?", a: r.scenario_challenges },
                  ]}
                />
                <ReflectionGroup
                  label="Step 2 — Policy"
                  fields={[
                    { q: "Why do you think policies need to be specified so granularly?", a: r.policy_granularity },
                    { q: "What aspects of the scenario most informed the policy development? What aspects were redundant or overly specific?", a: r.policy_scenario_inform },
                    { q: "Attempt to edit one of the policies. What makes a component editable?", a: r.policy_editable },
                  ]}
                />
                <ReflectionGroup
                  label="Step 5 — Guardrail Judgment"
                  fields={[
                    { q: "How do the guardrails differ between agentic and non-agentic judgment?", a: r.agentic_diff },
                    { q: "What other tools would you give an agentic guardrail?", a: r.other_tools },
                    { q: "What differences have you observed between English and non-English guardrail judgments?", a: r.multilingual_diff },
                    { q: "General observations", a: r.general_observations },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
