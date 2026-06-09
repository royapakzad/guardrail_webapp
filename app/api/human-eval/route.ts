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
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      evaluatorName,
      scenario,
      policyName,
      model,
      nonagenticVerdict,
      nonagenticScore,
      nonAgenticResult,
      agenticVerdict,
      agenticScore,
      agenticResult,
      guardrailMode,
      judgeModel,
      agenticDiff,
      generalObservations,
    } = body;

    await ensureTable();

    await sql`
      INSERT INTO workshop_responses (
        evaluator_name, scenario, policy_name, model,
        nonagentic_verdict, nonagentic_score, nonagentic_result,
        agentic_verdict, agentic_score, agentic_result,
        guardrail_mode, judge_model,
        agentic_diff, general_observations
      ) VALUES (
        ${evaluatorName || null}, ${scenario}, ${policyName}, ${model || null},
        ${nonagenticVerdict || null}, ${nonagenticScore ?? null},
        ${nonAgenticResult ? JSON.stringify(nonAgenticResult) : null},
        ${agenticVerdict || null}, ${agenticScore ?? null},
        ${agenticResult ? JSON.stringify(agenticResult) : null},
        ${guardrailMode || null}, ${judgeModel || null},
        ${agenticDiff || null}, ${generalObservations || null}
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
