export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchTavily(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY not set");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5, search_depth: "basic" }),
  });

  if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
  const data = await res.json();

  return (data.results || []).slice(0, 5).map((r: { title: string; url: string; content?: string; snippet?: string }) => ({
    title: r.title,
    url: r.url,
    snippet: (r.content || r.snippet || "").slice(0, 300),
  }));
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query);
  const res = await fetch(
    `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`,
    { headers: { "User-Agent": "guardrails-demo/1.0" } }
  );

  if (!res.ok) return [];
  const data = await res.json();

  const results: SearchResult[] = [];

  if (data.AbstractText && data.AbstractURL) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL,
      snippet: data.AbstractText.slice(0, 300),
    });
  }

  (data.RelatedTopics || []).slice(0, 4).forEach((t: { Text?: string; FirstURL?: string; Topics?: unknown[] }) => {
    if (t.Text && t.FirstURL && !t.Topics) {
      results.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text.slice(0, 300) });
    }
  });

  return results;
}

export async function search(query: string): Promise<SearchResult[]> {
  if (process.env.TAVILY_API_KEY) {
    return searchTavily(query);
  }
  return searchDuckDuckGo(query);
}
