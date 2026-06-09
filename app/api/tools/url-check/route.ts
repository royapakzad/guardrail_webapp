import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    let statusCode: number | null = null;
    let valid = false;
    let finalUrl = url;
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      let res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "guardrails-demo/1.0" },
      });

      clearTimeout(timeout);

      // Some servers reject HEAD — retry with GET
      if (res.status === 405) {
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 8000);
        res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: controller2.signal,
          headers: { "User-Agent": "guardrails-demo/1.0" },
        });
        clearTimeout(timeout2);
      }

      statusCode = res.status;
      finalUrl = res.url || url;
      // 401/403 = auth required but server exists — count as valid
      valid = res.status < 400 || res.status === 401 || res.status === 403;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      valid = false;
    }

    return NextResponse.json({ url, valid, status_code: statusCode, final_url: finalUrl, error });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "URL check failed" },
      { status: 500 }
    );
  }
}
