# Guardrails Demo — Mozilla.ai Workshop

Interactive web demo comparing **agentic** vs **non-agentic** guardrail evaluation across five domains.

## Setup

```bash
cd guardrails_webapp
npm install
cp .env.local.example .env.local
# Edit .env.local with your API keys
npm run dev
```

Open http://localhost:3000

## Required API keys (.env.local)

| Variable | Required | Purpose |
|---|---|---|
| `OTARI_API_KEY` | ✅ | Otari.ai model gateway (response generation + guardrail judge) |
| `OTARI_BASE_URL` | ✅ | Otari.ai API base URL |
| `GOOGLE_API_KEY` | ✅ | Gemini 2.5 Flash for translation |
| `TAVILY_API_KEY` | Recommended | Web search for agentic guardrail. Falls back to DuckDuckGo if not set. |

## The 5-step flow

1. **Scenario** — choose from 10 preloaded scenarios (2 per domain) or write a custom one
2. **Policy** — choose which policy to evaluate against (6 preloaded)
3. **Translate** — optionally translate the scenario to any language using Gemini 2.5 Flash
4. **Generate** — run the scenario through any model available on Otari.ai
5. **Guardrail** — evaluate the response with non-agentic (text-only) and/or agentic (with web search, URL checks, acronym verification)

## Domains

- 💰 **Financial** — investment fraud, debt scams
- 🌍 **Humanitarian** — asylum procedures, Istanbul Protocol
- ⚖️ **Legal** — security deposits, wrongful termination
- 🏥 **Healthcare** — emergency symptoms, online pharmacies
- 🔒 **Cybersecurity** — tech support scams, phishing

## Policies

- Generic taxonomy of harm
- Financial services
- Humanitarian/asylum
- Legal information
- Healthcare
- Cybersecurity

## What the agentic guardrail does

The agentic path uses tool calls to verify the response:
- **URL validity** — checks every URL cited in the response (HTTP HEAD/GET)
- **Web search** — searches for factual claims (law names, organization names, statistics)
- **Acronym verification** — checks that acronyms match their stated expansions
- **Full page fetch** — reads source documents for deep verification

Tool calls are streamed live so workshop participants can watch the guardrail working in real time.

## Vercel deployment

This app is ready for Vercel. Set the environment variables in the Vercel dashboard and deploy:

```bash
vercel deploy
```

Set `NEXT_PUBLIC_BASE_URL` to your Vercel deployment URL for the agentic route's internal tool calls.
