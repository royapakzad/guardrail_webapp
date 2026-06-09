import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

interface HumanEval {
  id: number;
  created_at: string;
  evaluator_name: string | null;
  scenario: string;
  policy_name: string;
  nonagentic_verdict: string | null;
  nonagentic_score: number | null;
  agentic_verdict: string | null;
  agentic_score: number | null;
  guardrail_mode: string | null;
  judge_model: string | null;
  agrees_with_ai: string;
  noticed_issues: string | null;
  response_quality: number | null;
  policy_adjustment: string | null;
  additional_comments: string | null;
}

function verdictColor(v: string | null) {
  if (!v) return "bg-slate-100 text-slate-500";
  if (v === "PASS") return "bg-green-100 text-green-700";
  if (v === "FAIL") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

function agreementColor(a: string) {
  if (a === "Agree") return "bg-green-100 text-green-700";
  if (a === "Disagree") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

export default async function AdminPage() {
  let evaluations: HumanEval[] = [];
  let dbError: string | null = null;

  try {
    const { rows } = await sql<HumanEval>`
      SELECT * FROM human_evaluations ORDER BY created_at DESC
    `;
    evaluations = rows;
  } catch {
    dbError =
      "Database not connected. Set up Vercel Postgres in your project's Storage tab, then redeploy.";
  }

  const agreementCounts = evaluations.reduce<Record<string, number>>(
    (acc, ev) => {
      acc[ev.agrees_with_ai] = (acc[ev.agrees_with_ai] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workshop — Human Evaluations</h1>
          <p className="text-slate-500 mt-1">
            {evaluations.length} response{evaluations.length !== 1 ? "s" : ""} collected
          </p>
        </div>

        {dbError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
            {dbError}
          </div>
        )}

        {/* Summary stats */}
        {evaluations.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(agreementCounts).map(([label, count]) => (
              <div key={label} className="bg-white rounded-xl border p-4 text-center">
                <p className="text-2xl font-bold text-slate-900">{count}</p>
                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
            <div className="bg-white rounded-xl border p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">
                {evaluations.filter((e) => e.response_quality !== null).length > 0
                  ? (
                      evaluations.reduce((s, e) => s + (e.response_quality ?? 0), 0) /
                      evaluations.filter((e) => e.response_quality !== null).length
                    ).toFixed(1)
                  : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Avg quality (1–5)</p>
            </div>
          </div>
        )}

        {/* Entries */}
        {evaluations.length === 0 && !dbError && (
          <p className="text-slate-400 text-sm">No submissions yet.</p>
        )}

        <div className="space-y-4">
          {evaluations.map((ev) => (
            <div key={ev.id} className="bg-white rounded-xl border p-5 space-y-3">
              {/* Top row */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium text-slate-800">
                    {ev.evaluator_name || <span className="text-slate-400 font-normal">Anonymous</span>}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(ev.created_at).toLocaleString()} · {ev.policy_name} · {ev.guardrail_mode}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  {ev.nonagentic_verdict && (
                    <span className={`px-2 py-0.5 rounded ${verdictColor(ev.nonagentic_verdict)}`}>
                      Non-agentic: {ev.nonagentic_verdict}
                    </span>
                  )}
                  {ev.agentic_verdict && (
                    <span className={`px-2 py-0.5 rounded ${verdictColor(ev.agentic_verdict)}`}>
                      Agentic: {ev.agentic_verdict}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded ${agreementColor(ev.agrees_with_ai)}`}>
                    Human: {ev.agrees_with_ai}
                  </span>
                  {ev.response_quality !== null && (
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      Quality: {ev.response_quality}/5
                    </span>
                  )}
                  {ev.policy_adjustment && (
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                      Policy: {ev.policy_adjustment}
                    </span>
                  )}
                </div>
              </div>

              {/* Scenario */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Scenario</p>
                <p className="text-sm text-slate-700 line-clamp-2">{ev.scenario}</p>
              </div>

              {/* Issues */}
              {ev.noticed_issues && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Issues noticed</p>
                  <p className="text-sm text-slate-700">{ev.noticed_issues}</p>
                </div>
              )}

              {/* Comments */}
              {ev.additional_comments && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Additional comments</p>
                  <p className="text-sm text-slate-700">{ev.additional_comments}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
