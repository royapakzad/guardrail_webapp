import { sql } from "@vercel/postgres";
import { NextRequest, NextResponse } from "next/server";

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS workshop_responses (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      evaluator_name TEXT,
      scenario TEXT NOT NULL,
      policy_name TEXT NOT NULL,
      model TEXT,
      nonagentic_verdict TEXT,
      nonagentic_score REAL,
      nonagentic_result JSONB,
      agentic_verdict TEXT,
      agentic_score REAL,
      agentic_result JSONB,
      guardrail_mode TEXT,
      judge_model TEXT,
      agentic_diff TEXT,
      general_observations TEXT
    )
  `;
  // Migrate: add columns introduced after initial deploy
  const migrations = [
    sql`ALTER TABLE workshop_responses ADD COLUMN IF NOT EXISTS llm_response TEXT`,
    sql`ALTER TABLE workshop_responses ADD COLUMN IF NOT EXISTS policy_text TEXT`,
    sql`ALTER TABLE workshop_responses ADD COLUMN IF NOT EXISTS agentic_events JSONB`,
    sql`ALTER TABLE workshop_responses ADD COLUMN IF NOT EXISTS scenario_patterns TEXT`,
    sql`ALTER TABLE workshop_responses ADD COLUMN IF NOT EXISTS scenario_challenges TEXT`,
    sql`ALTER TABLE workshop_responses ADD COLUMN IF NOT EXISTS policy_granularity TEXT`,
    sql`ALTER TABLE workshop_responses ADD COLUMN IF NOT EXISTS policy_scenario_inform TEXT`,
    sql`ALTER TABLE workshop_responses ADD COLUMN IF NOT EXISTS policy_editable TEXT`,
    sql`ALTER TABLE workshop_responses ADD COLUMN IF NOT EXISTS other_tools TEXT`,
    sql`ALTER TABLE workshop_responses ADD COLUMN IF NOT EXISTS multilingual_diff TEXT`,
  ];
  await Promise.all(migrations);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      evaluatorName,
      scenario,
      policyName,
      policyText,
      model,
      llmResponse,
      nonagenticVerdict,
      nonagenticScore,
      nonAgenticResult,
      agenticVerdict,
      agenticScore,
      agenticResult,
      agenticEvents,
      guardrailMode,
      judgeModel,
      // Step 1 reflections
      scenarioPatterns,
      scenarioChallenges,
      // Step 2 reflections
      policyGranularity,
      policyScenarioInform,
      policyEditable,
      // Step 5 reflections
      agenticDiff,
      otherTools,
      multilingualDiff,
      generalObservations,
    } = body;

    await ensureTable();

    await sql`
      INSERT INTO workshop_responses (
        evaluator_name, scenario, policy_name, policy_text, model, llm_response,
        nonagentic_verdict, nonagentic_score, nonagentic_result,
        agentic_verdict, agentic_score, agentic_result, agentic_events,
        guardrail_mode, judge_model,
        scenario_patterns, scenario_challenges,
        policy_granularity, policy_scenario_inform, policy_editable,
        agentic_diff, other_tools, multilingual_diff, general_observations
      ) VALUES (
        ${evaluatorName || null}, ${scenario}, ${policyName}, ${policyText || null},
        ${model || null}, ${llmResponse || null},
        ${nonagenticVerdict || null}, ${nonagenticScore ?? null},
        ${nonAgenticResult ? JSON.stringify(nonAgenticResult) : null},
        ${agenticVerdict || null}, ${agenticScore ?? null},
        ${agenticResult ? JSON.stringify(agenticResult) : null},
        ${agenticEvents ? JSON.stringify(agenticEvents) : null},
        ${guardrailMode || null}, ${judgeModel || null},
        ${scenarioPatterns || null}, ${scenarioChallenges || null},
        ${policyGranularity || null}, ${policyScenarioInform || null}, ${policyEditable || null},
        ${agenticDiff || null}, ${otherTools || null},
        ${multilingualDiff || null}, ${generalObservations || null}
      )
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("human-eval POST error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    const isDbError =
      msg.includes("connect") || msg.includes("POSTGRES") || msg.includes("relation");
    return NextResponse.json(
      {
        error: isDbError
          ? "Database not configured yet. Set up Vercel Postgres in your project's Storage tab."
          : msg,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await ensureTable();
    const { rows } = await sql`
      SELECT * FROM workshop_responses ORDER BY created_at DESC
    `;
    return NextResponse.json({ evaluations: rows });
  } catch (error) {
    console.error("human-eval GET error:", error);
    return NextResponse.json(
      { error: "Database not configured. Set up Vercel Postgres first." },
      { status: 500 }
    );
  }
}
