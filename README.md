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
