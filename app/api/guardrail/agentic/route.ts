import { NextRequest } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;
import { getOpenAIClient } from "@/lib/llm-client";
import {
  buildAgenticSystemPrompt,
  buildAgenticUserMessage,
  TOOL_SCHEMAS,
  CONCLUDE_MESSAGE,
  RETRY_MESSAGE,
  VALID_SCORE_THRESHOLD,
  MAX_TOOL_CALLS,
} from "@/lib/prompts";
import { RUBRIC } from "@/lib/policies";
import type { GuardrailResult, UrlCheck, AgenticEvent } from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────

function parseJudgment(text: string): GuardrailResult | null {
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch {} }
  return null;
}

function rederiveScore(explanation: string): number | null {
  const m = explanation.match(
    /final\s+score\s*[:=]\s*max\s*\(\s*0\.05\s*,\s*1\.0\s*[-−]\s*(\d+(?:\.\d+)?)\s*\)\s*=\s*(\d+(?:\.\d+)?)/i
  );
  if (!m) return null;
  try { return Math.round(Math.max(0.05, 1.0 - parseFloat(m[1])) * 1000) / 1000; }
  catch { return null; }
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s"'<>()[\]{}]+/g;
  return [...new Set(text.match(re) ?? [])];
}

function extractAcronyms(text: string): Array<{ acronym: string; expansion: string }> {
  const patterns = [
    /\b([A-Z]{2,8})\s*\(([^)]{5,80})\)/g,
    /([^(]{5,80})\s*\(([A-Z]{2,8})\)/g,
  ];
  const pairs: Array<{ acronym: string; expansion: string }> = [];
  const seen = new Set<string>();

  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(text)) !== null) {
      const [a, b] = [m[1].trim(), m[2].trim()];
      const acronym = /^[A-Z]{2,8}$/.test(a) ? a : b;
      const expansion = /^[A-Z]{2,8}$/.test(a) ? b : a;
      if (!seen.has(acronym) && expansion.split(" ").length > 1) {
        seen.add(acronym);
        pairs.push({ acronym, expansion });
      }
    }
  }
  return pairs;
}

// SSE emit helper
function emit(controller: ReadableStreamDefaultController, event: AgenticEvent) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// Shared tool execution — provider-agnostic
async function executeToolCall(
  toolName: string,
  args: Record<string, string>,
  controller: ReadableStreamDefaultController,
  turn: number,
  sourcesUsed: string[]
): Promise<string> {
  const baseUrl = getBaseUrl();
  let resultStr = "";

  if (toolName === "search_web") {
    const r = await fetch(`${baseUrl}/api/tools/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: args.query }),
    });
    const { results } = await r.json();
    sourcesUsed.push(`search: ${args.query}`);
    resultStr = JSON.stringify(results ?? []);
    const preview = (results ?? [])
      .slice(0, 3)
      .map((r: { title: string; url: string; snippet: string }) => `"${r.title}" (${r.url}) — ${r.snippet.slice(0, 80)}`)
      .join("; ");
    emit(controller, {
      type: "tool_result",
      tool: toolName,
      result: `${(results ?? []).length} result(s). ${preview}`,
      turn,
    });
  } else if (toolName === "fetch_url") {
    const r = await fetch(args.url, { headers: { "User-Agent": "guardrails-demo/1.0" } });
    const text = await r.text();
    resultStr = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000);
    sourcesUsed.push(`fetch: ${args.url}`);
    emit(controller, {
      type: "tool_result",
      tool: toolName,
      result: `${resultStr.length} chars — ${resultStr.slice(0, 150)}`,
      turn,
    });
  } else if (toolName === "check_url_validity") {
    const r = await fetch(`${baseUrl}/api/tools/url-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: args.url }),
    });
    const check = await r.json();
    resultStr = JSON.stringify(check);
    sourcesUsed.push(`url_check: ${args.url} → HTTP ${check.status_code}`);
    emit(controller, {
      type: "tool_result",
      tool: toolName,
      result: `HTTP ${check.status_code} (${check.valid ? "✓ VALID" : "✗ BROKEN"})`,
      turn,
    });
  } else if (toolName === "check_acronym") {
    const r = await fetch(`${baseUrl}/api/tools/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `${args.acronym} stands for "${args.claimed_expansion}" official name`,
      }),
    });
    const { results } = await r.json();
    const combinedText = (results ?? []).map((r: { title: string; snippet: string }) => `${r.title} ${r.snippet}`).join(" ").toLowerCase();
    const words = (args.claimed_expansion || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
    const matched = words.filter((w: string) => combinedText.includes(w)).length;
    const matchScore = words.length > 0 ? matched / words.length : 0;
    const verdict = (results ?? []).length === 0 ? "no_results"
      : matchScore >= 0.6 ? "likely_correct"
      : matchScore < 0.25 ? "likely_wrong" : "unclear";
    resultStr = JSON.stringify({ verdict_hint: verdict, match_score: matchScore, search_results: results });
    emit(controller, {
      type: "tool_result",
      tool: toolName,
      result: `${args.acronym} → ${verdict} (match ${Math.round(matchScore * 100)}%)`,
      turn,
    });
  }

  return resultStr;
}

// Anthropic tool schemas converted from OpenAI format
const ANTHROPIC_TOOLS: Anthropic.Tool[] = TOOL_SCHEMAS.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
}));

// ── Main route ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const {
    policy,
    systemPrompt,
    userMessage,
    assistantResponse,
    judgeModel = "gpt-4o-mini",
  } = await req.json();

  const useAnthropic = judgeModel.startsWith("claude") &&
    !!process.env.ANTHROPIC_API_KEY &&
    !process.env.OTARI_BASE_URL;

  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Pre-run: URL checks ──────────────────────────────────────────
        const urls = extractUrls(assistantResponse);
        const urlResults: UrlCheck[] = [];
        let urlContext = "";

        for (const url of urls) {
          let check: UrlCheck;
          try {
            const ctrl2 = new AbortController();
            const timeout = setTimeout(() => ctrl2.abort(), 8000);
            let res = await fetch(url, {
              method: "HEAD",
              redirect: "follow",
              signal: ctrl2.signal,
              headers: { "User-Agent": "guardrails-demo/1.0" },
            });
            clearTimeout(timeout);
            if (res.status === 405) {
              const c2 = new AbortController();
              setTimeout(() => c2.abort(), 8000);
              res = await fetch(url, { method: "GET", redirect: "follow", signal: c2.signal });
            }
            const valid = res.status < 400 || res.status === 401 || res.status === 403;
            check = { url, valid, status_code: res.status, final_url: res.url };
          } catch (e) {
            check = { url, valid: false, status_code: null, error: String(e) };
          }

          urlResults.push(check);
          emit(controller, { type: "prerun_url", url: check.url, valid: check.valid, status: check.status_code });
          urlContext += `• ${url} → HTTP ${check.status_code ?? "None"} (${check.valid ? "VALID" : "✗ BROKEN"})\n`;
        }

        // ── Pre-run: acronym checks ──────────────────────────────────────
        const acronyms = extractAcronyms(assistantResponse);
        let acronymContext = "";

        for (const { acronym, expansion } of acronyms.slice(0, 5)) {
          try {
            const searchRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/tools/search`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: `${acronym} official name expansion ${expansion}` }),
            });

            let verdictHint = "unclear";
            let matchScore = 0;

            if (searchRes.ok) {
              const { results } = await searchRes.json();
              const combinedText = results.map((r: { title: string; snippet: string }) => `${r.title} ${r.snippet}`).join(" ").toLowerCase();
              const words = expansion.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
              const matched = words.filter((w: string) => combinedText.includes(w)).length;
              matchScore = words.length > 0 ? matched / words.length : 0;

              if (results.length === 0) verdictHint = "no_results";
              else if (matchScore >= 0.6) verdictHint = "likely_correct";
              else if (matchScore < 0.25) verdictHint = "likely_wrong";
            }

            emit(controller, { type: "prerun_acronym", acronym, expansion, verdict: verdictHint, match: matchScore });
            acronymContext += `• ${acronym} → claimed="${expansion}": ${verdictHint} (match ${Math.round(matchScore * 100)}%)\n`;
          } catch {
            acronymContext += `• ${acronym} → check failed\n`;
          }
        }

        // ── Build prompts ────────────────────────────────────────────────
        const sysPrompt = buildAgenticSystemPrompt(policy, RUBRIC);
        const userMsg = buildAgenticUserMessage(
          systemPrompt || "",
          userMessage,
          assistantResponse,
          urlContext,
          acronymContext
        );

        let toolCallsMade = 0;
        const sourcesUsed: string[] = [];
        let finalText = "";

        // ── Anthropic tool-call loop ─────────────────────────────────────
        if (useAnthropic) {
          const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const anthropicMessages: Anthropic.MessageParam[] = [
            { role: "user", content: userMsg },
          ];

          for (let turn = 0; turn < MAX_TOOL_CALLS + 2; turn++) {
            const response = await anthropic.messages.create({
              model: judgeModel,
              max_tokens: 2000,
              system: sysPrompt,
              messages: anthropicMessages,
              tools: toolCallsMade < MAX_TOOL_CALLS ? ANTHROPIC_TOOLS : undefined,
            });

            const toolUses = response.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
            );

            if (toolUses.length === 0 || response.stop_reason === "end_turn") {
              finalText = response.content
                .filter((b): b is Anthropic.TextBlock => b.type === "text")
                .map((b) => b.text)
                .join("");
              break;
            }

            anthropicMessages.push({ role: "assistant", content: response.content });

            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const tu of toolUses) {
              toolCallsMade++;
              const args = tu.input as Record<string, string>;
              emit(controller, { type: "tool_call", tool: tu.name, args, turn });

              let resultStr = "";
              try {
                resultStr = await executeToolCall(tu.name, args, controller, turn, sourcesUsed);
              } catch (e) {
                resultStr = `Error: ${e}`;
                emit(controller, { type: "tool_result", tool: tu.name, result: `Error: ${e}`, turn });
              }
              toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: resultStr });
            }

            anthropicMessages.push({ role: "user", content: toolResults });

            if (toolCallsMade >= MAX_TOOL_CALLS) {
              anthropicMessages.push({ role: "user", content: CONCLUDE_MESSAGE.content as string });
              const finalResponse = await anthropic.messages.create({
                model: judgeModel,
                max_tokens: 2000,
                system: sysPrompt,
                messages: anthropicMessages,
              });
              finalText = finalResponse.content
                .filter((b): b is Anthropic.TextBlock => b.type === "text")
                .map((b) => b.text)
                .join("");
              break;
            }
          }

          // Retry if parse fails
          let result = parseJudgment(finalText);
          if (!result) {
            const retryMessages: Anthropic.MessageParam[] = [
              ...anthropicMessages,
              { role: "assistant", content: finalText },
              { role: "user", content: RETRY_MESSAGE.content as string },
            ];
            const retryResponse = await anthropic.messages.create({
              model: judgeModel,
              max_tokens: 2000,
              system: sysPrompt,
              messages: retryMessages,
            });
            result = parseJudgment(
              retryResponse.content
                .filter((b): b is Anthropic.TextBlock => b.type === "text")
                .map((b) => b.text)
                .join("")
            );
          }

          if (!result) {
            emit(controller, { type: "error", message: "Failed to parse guardrail judgment" });
            controller.close();
            return;
          }

          finalizeAndEmit(result, toolCallsMade, sourcesUsed, urlResults, startTime, controller);

        // ── OpenAI tool-call loop ────────────────────────────────────────
        } else {
          const { client } = getOpenAIClient(judgeModel);
          const messages: OpenAI.ChatCompletionMessageParam[] = [
            { role: "system", content: sysPrompt },
            { role: "user", content: userMsg },
          ];

          for (let turn = 0; turn < MAX_TOOL_CALLS + 2; turn++) {
            const callOpts: OpenAI.ChatCompletionCreateParams = {
              model: judgeModel,
              messages,
              max_tokens: 2000,
              temperature: 0,
              tools: toolCallsMade < MAX_TOOL_CALLS ? (TOOL_SCHEMAS as OpenAI.ChatCompletionTool[]) : undefined,
              tool_choice: toolCallsMade < MAX_TOOL_CALLS ? "auto" : "none",
            };

            const completion = await client.chat.completions.create(callOpts);
            const msg = completion.choices[0].message;
            messages.push(msg);

            if (!msg.tool_calls || msg.tool_calls.length === 0) {
              finalText = msg.content ?? "";
              break;
            }

            for (const tc of msg.tool_calls) {
              toolCallsMade++;
              const toolName = tc.function.name;
              let args: Record<string, string> = {};
              try { args = JSON.parse(tc.function.arguments); } catch {}

              emit(controller, { type: "tool_call", tool: toolName, args, turn });

              let resultStr = "";
              try {
                resultStr = await executeToolCall(toolName, args, controller, turn, sourcesUsed);
              } catch (e) {
                resultStr = `Error: ${e}`;
                emit(controller, { type: "tool_result", tool: toolName, result: `Error: ${e}`, turn });
              }

              messages.push({ role: "tool", tool_call_id: tc.id, content: resultStr });
            }

            if (toolCallsMade >= MAX_TOOL_CALLS) {
              messages.push(CONCLUDE_MESSAGE);
              const finalCompletion = await client.chat.completions.create({
                model: judgeModel,
                messages,
                max_tokens: 2000,
                temperature: 0,
              });
              finalText = finalCompletion.choices[0].message.content ?? "";
              break;
            }
          }

          // Retry if parse fails
          let result = parseJudgment(finalText);
          if (!result) {
            messages.push({ role: "assistant", content: finalText });
            messages.push(RETRY_MESSAGE);
            const retryCompletion = await client.chat.completions.create({
              model: judgeModel,
              messages,
              max_tokens: 2000,
              temperature: 0,
            });
            result = parseJudgment(retryCompletion.choices[0].message.content ?? "");
          }

          if (!result) {
            emit(controller, { type: "error", message: "Failed to parse guardrail judgment" });
            controller.close();
            return;
          }

          finalizeAndEmit(result, toolCallsMade, sourcesUsed, urlResults, startTime, controller);
        }

      } catch (err) {
        emit(controller, {
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function finalizeAndEmit(
  result: GuardrailResult,
  toolCallsMade: number,
  sourcesUsed: string[],
  urlResults: UrlCheck[],
  startTime: number,
  controller: ReadableStreamDefaultController
) {
  const rederived = rederiveScore(result.explanation || "");
  if (rederived !== null && Math.abs(rederived - (result.score ?? 0)) > 0.01) {
    result.score = rederived;
  }

  const score = result.score ?? 0;
  result.valid = score > VALID_SCORE_THRESHOLD;
  if (score >= 0.70) result.overall_verdict = "PASS";
  else if (score >= 0.55) result.overall_verdict = "BORDERLINE";
  else result.overall_verdict = "FAIL";

  result.tool_calls_made = toolCallsMade;
  result.sources_used = sourcesUsed;
  result.url_checks = urlResults;
  result.judgment_time_s = (Date.now() - startTime) / 1000;

  emit(controller, { type: "judgment", result });
  controller.close();
}
