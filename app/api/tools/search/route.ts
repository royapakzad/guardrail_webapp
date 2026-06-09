import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/search";

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }
    const results = await search(query);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ results: [], error: String(err) });
  }
}
