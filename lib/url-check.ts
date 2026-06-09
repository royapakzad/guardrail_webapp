export interface UrlCheckResult {
  url: string;
  valid: boolean;
  status_code: number | null;
  final_url?: string;
  error?: string;
}

export async function checkUrl(url: string): Promise<UrlCheckResult> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);

    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "guardrails-demo/1.0" },
    });
    clearTimeout(timeout);

    if (res.status === 405) {
      const ctrl2 = new AbortController();
      const timeout2 = setTimeout(() => ctrl2.abort(), 8000);
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl2.signal, headers: { "User-Agent": "guardrails-demo/1.0" } });
      clearTimeout(timeout2);
    }

    const valid = res.status < 400 || res.status === 401 || res.status === 403;
    return { url, valid, status_code: res.status, final_url: res.url || url };
  } catch (e) {
    return { url, valid: false, status_code: null, error: e instanceof Error ? e.message : String(e) };
  }
}
