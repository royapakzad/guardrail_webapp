import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const { text, targetLanguage, systemPrompt } = await req.json();

    if (!text || !targetLanguage) {
      return NextResponse.json({ error: "text and targetLanguage are required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_API_KEY not configured" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Translate the following text to ${targetLanguage}.
Preserve all proper nouns, organization names, acronyms (keep them in original form), URLs, and technical terms exactly as they are.
Translate only the natural language parts. Keep the meaning identical.
Return ONLY the translated text with no explanation or preamble.

Text to translate:
${text}`;

    const result = await model.generateContent(prompt);
    const translatedText = result.response.text().trim();

    // Also translate system prompt if provided
    let translatedSystemPrompt = "";
    if (systemPrompt) {
      const spResult = await model.generateContent(
        `Translate the following system prompt to ${targetLanguage}. Preserve all technical terms, keep instructions precise. Return ONLY the translated text.\n\n${systemPrompt}`
      );
      translatedSystemPrompt = spResult.response.text().trim();
    }

    return NextResponse.json({ translatedText, translatedSystemPrompt });
  } catch (err) {
    console.error("Translation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Translation failed" },
      { status: 500 }
    );
  }
}
