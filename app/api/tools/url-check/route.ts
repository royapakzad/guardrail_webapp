import { NextRequest, NextResponse } from "next/server";
import { checkUrl } from "@/lib/url-check";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    const result = await checkUrl(url);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "URL check failed" },
      { status: 500 }
    );
  }
}
