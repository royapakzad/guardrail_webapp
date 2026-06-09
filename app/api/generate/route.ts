import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { model, systemPrompt, userMessage } = await req.json();

    if (!model || !userMessage) {
      return NextResponse.json({ error: "model and userMessage are required" }, { status: 400 });
    }

    const otariBase = process.env.OTARI_BASE_URL;

    // ── Anthropic direct (Claude models, no Otari) ──────────────────────────
    if (model.startsWith("claude") && process.env.ANTHROPIC_API_KEY && !otariBase) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const result = await client.messages.create({
        model,
        max_tokens: 1500,
        system: systemPrompt || undefined,
        messages: [{ role: "user", content: userMessage }],
      });
      const text = result.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
      return NextResponse.json({
        response: text,
        usage: {
          prompt_tokens: result.usage.input_tokens,
          completion_tokens: result.usage.output_tokens,
          total_tokens: result.usage.input_tokens + result.usage.output_tokens,
        },
      });
    }

    // ── Gemini direct ────────────────────────────────────────────────────────
    if (model.startsWith("gemini") && process.env.GOOGLE_API_KEY && !otariBase) {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const gModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt || undefined });
      const result = await gModel.generateContent(userMessage);
      return NextResponse.json({
        response: result.response.text(),
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }

    // ── OpenAI direct or Otari ───────────────────────────────────────────────
    // Only use OTARI_API_KEY when OTARI_BASE_URL is also configured
    const apiKey = (otariBase ? process.env.OTARI_API_KEY : null) ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "No API key configured. Set OPENAI_API_KEY in .env.local" }, { status: 500 });
    }
    const client = new OpenAI({ apiKey, baseURL: otariBase || undefined });
    const openaiModel = model.startsWith("gpt") || otariBase ? model : "gpt-4o-mini";

    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: userMessage });

    const completion = await client.chat.completions.create({
      model: openaiModel,
      messages,
      max_tokens: 1500,
      temperature: 0.7,
    });

    return NextResponse.json({
      response: completion.choices[0]?.message?.content ?? "",
      usage: {
        prompt_tokens: completion.usage?.prompt_tokens ?? 0,
        completion_tokens: completion.usage?.completion_tokens ?? 0,
        total_tokens: completion.usage?.total_tokens ?? 0,
      },
    });
  } catch (err) {
    console.error("Generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
