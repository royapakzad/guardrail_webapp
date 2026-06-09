import { sql } from "@vercel/postgres";
import { NextRequest, NextResponse } from "next/server";

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS human_evaluations (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      evaluator_name TEXT,
      scenario TEXT NOT NULL,
      policy_name TEXT NOT NULL,
      nonagentic_verdict TEXT,
      nonagentic_score REAL,
      agentic_verdict TEXT,
      agentic_score REAL,
      guardrail_mode TEXT,
      judge_model TEXT,
      agrees_with_ai TEXT NOT NULL,
      noticed_issues TEXT,
      response_quality INTEGER,
      policy_adjustment TEXT,
      additional_comments TEXT
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
      nonagenticVerdict,
      nonagenticScore,
      agenticVerdict,
      agenticScore,
      guardrailMode,
      judgeModel,
      agreesWithAi,
      noticedIssues,
      responseQuality,
      policyAdjustment,
      additionalComments,
    } = body;

    await ensureTable();

    await sql`
      INSERT INTO human_evaluations (
        evaluator_name, scenario, policy_name,
        nonagentic_verdict, nonagentic_score,
        agentic_verdict, agentic_score,
        guardrail_mode, judge_model,
        agrees_with_ai, noticed_issues,
        response_quality, policy_adjustment, additional_comments
      ) VALUES (
        ${evaluatorName || null}, ${scenario}, ${policyName},
        ${nonagenticVerdict || null}, ${nonagenticScore ?? null},
        ${agenticVerdict || null}, ${agenticScore ?? null},
        ${guardrailMode || null}, ${judgeModel || null},
        ${agreesWithAi}, ${noticedIssues || null},
        ${responseQuality ?? null}, ${policyAdjustment || null}, ${additionalComments || null}
      )
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("human-eval POST error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    const isDbError = msg.includes("connect") || msg.includes("POSTGRES") || msg.includes("relation");
    return NextResponse.json(
      {
        error: isDbError
          ? "Database not configured yet. Set up Vercel Postgres in your project's Storage tab, then redeploy."
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
      SELECT * FROM human_evaluations ORDER BY created_at DESC
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
