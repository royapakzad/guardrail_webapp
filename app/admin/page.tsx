import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

interface WorkshopResponse {
  id: number;
  created_at: string;
  evaluator_name: string | null;
  scenario: string;
  policy_name: string;
  model: string | null;
  nonagentic_verdict: string | null;
  nonagentic_score: number | null;
  nonagentic_result: Record<string, unknown> | null;
  agentic_verdict: string | null;
  agentic_score: number | null;
  agentic_result: Record<string, unknown> | null;
  guardrail_mode: string | null;
  judge_model: string | null;
  agentic_diff: string | null;
  general_observations: string | null;
}

function verdictChip(v: string | null, score?: number | null) {
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
      {score != null && (
        <span className="font-normal opacity-70 ml-1">({score.toFixed(2)})</span>
      )}
    </span>
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
      <div className="max-w-4xl mx-auto space-y-8">
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

        <div className="space-y-6">
          {responses.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b bg-slate-50 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-slate-800">
                    {r.evaluator_name ?? <span className="text-slate-400 font-normal italic">Anonymous</span>}
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
                      Non-agentic: {verdictChip(r.nonagentic_verdict, r.nonagentic_score)}
                    </span>
                  )}
                  {r.agentic_verdict && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      Agentic: {verdictChip(r.agentic_verdict, r.agentic_score)}
                    </span>
                  )}
                </div>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Scenario */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Scenario</p>
                  <p className="text-sm text-slate-700">{r.scenario}</p>
                </div>

                {/* Guardrail details */}
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
                              {(r.nonagentic_result.improvements_required as string[]).map(
                                (imp: string, i: number) => (
                                  <p key={i} className="text-slate-600 ml-2">→ {imp}</p>
                                )
                              )}
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
                              {(r.agentic_result.improvements_required as string[]).map(
                                (imp: string, i: number) => (
                                  <p key={i} className="text-slate-600 ml-2">→ {imp}</p>
                                )
                              )}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}

                {/* Human observations */}
                {(r.agentic_diff || r.general_observations) && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-indigo-700">Human observations</p>
                    {r.agentic_diff && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
                          Agentic vs. non-agentic differences
                        </p>
                        <p className="text-sm text-slate-700">{r.agentic_diff}</p>
                      </div>
                    )}
                    {r.general_observations && (
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
                          General observations
                        </p>
                        <p className="text-sm text-slate-700">{r.general_observations}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
