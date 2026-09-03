# Content Engine

Signal driven content creation powered by AI. Fetches real time news signals, generates platform specific content (Instagram, LinkedIn, Twitter/X, Email), and creates AI visuals using Nano Banana Pro.

## Stack

- **Next.js 14** (App Router)
- **Claude Opus 4.6** for content generation
- **Claude Sonnet 4.6** for general tasks + web search
- **Nano Banana Pro** (Gemini 3 Pro Image) for Instagram creatives
- **Airtable** for brand data persistence

## Environment Variables

| Variable | Required | Where to get |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | console.anthropic.com/settings/keys |
| `GOOGLE_AI_API_KEY` | Yes | aistudio.google.com/apikey |
| `AIRTABLE_PAT` | Optional | airtable.com/create/tokens |
| `AIRTABLE_BASE_ID` | Optional | From Airtable URL: airtable.com/appXXX/... |

## Deploy to Vercel

1. Push to GitHub
2. Import at vercel.com/new
3. Add env vars in Settings > Environment Variables
4. Deploy

## Local Dev

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Project Structure

```
content-engine/
├── app/
│   ├── api/
│   │   ├── ai/route.js              # Anthropic proxy
│   │   ├── ai-search/route.js       # Anthropic + web search
│   │   ├── generate-image/route.js   # Nano Banana Pro
│   │   └── airtable/route.js        # Brand data CRUD
│   ├── globals.css
│   ├── layout.js
│   └── page.js
├── components/
│   └── ContentEngine.jsx
├── vercel.json
├── .env.example
└── package.json
```

## September 2026: brand re-skin and the kept additions

The app kept its 8-step flow and every field, prompt and API route. What changed:

- **Design tokens** live in `app/tokens.css`. Light is the default; dark is opt-in from Profile. Fonts load through `next/font` (DM Sans, DM Mono, Playfair Display for the wordmark). The component's palette object points at the tokens, so the whole app re-skins from one file.
- **Opening screen** before the wizard, shown once per browser session.
- **Fetch News** now asks for 40 to 50 signals and three extra fields per item: `TYPE`, `URL`, `HOT`. **Select News** shows "Worth your time", the 10 hottest signals, above a collapsed list of the rest with a latest / oldest sort.
- **Every signal links to its source.** `/api/verify-links` checks the links right after a fetch; cards say "link verified" or "link not verified" and never hide a signal.
- **Bookmarks, drafts and folders**, visible in **Profile** (top right). Stored in this browser's localStorage. No accounts yet.
- **Controversy guardrail**: a controversy signal with a source cannot be selected until that source has been opened, and its drafts carry a "verify before posting" strip.
- `?demo` loads sample signals into Select News without spending a search (`lib/demo.js`; illustrative, not real news).
- `/api/ai-search` `max_tokens` raised from 4096 to 8192 so 50 items do not truncate mid-list.
