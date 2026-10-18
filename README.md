# Huesy

Hear about the launch the day it breaks, and leave with the post already written.

Huesy checks Google News, Instagram and X for brand launches, collabs and campaigns, ranks what it finds
for your brand, and drafts the caption, the post, the thread and the newsletter in a voice you set once.

Live: https://content-engine-two-pink.vercel.app

## What it is made of

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router, React 19 |
| Styling | Tailwind v4 with a token layer in `app/globals.css` |
| State | Zustand, persisted to `localStorage`, mirrored to Supabase per account |
| Backend | Supabase: auth, `user_state`, `waitlist`, `contact_messages`, `ai_usage`, `site_events` |
| AI | Anthropic SDK. Search and writing on Claude Sonnet 5.5, small jobs and ranking on Claude Haiku 5.5 |
| Creatives | Nano Banana Pro (Gemini 3 Pro Image), from the browser with the person's own key |
| Motion | Motion (Framer Motion) springs |
| Icons | Phosphor, one family everywhere |

## The website is a waitlist

`/` is a waitlist page: every call to action joins the list, and nothing on it sends a visitor into the
product. It has the join form in the first screen, a sample run that shows the product working in seven
seconds without any AI call (every brand in it is invented and labelled Sample), why Huesy exists, what
happens when a place opens, questions, and the form again at the end. `/privacy` says what is stored.

- **Joins** go to `POST /api/waitlist` and land in Supabase `waitlist` (email, where on the page, campaign
  tags, referrer). The reply carries a one time `edit_token`, which is the only way to add the optional
  answer to "What should Huesy watch for you?" (`PATCH /api/waitlist`). A repeat join answers `already`
  and no token, so knowing someone's address never lets anyone change their row. A hidden field catches
  bots. No confirmation email is sent, so the success state echoes the address back with "Change it".
- **Counts** go to `POST /api/event` and `site_events`: views, form focus, joins, answers, sample runs,
  with the part of the page they happened on. No IP address, user agent or cookie.

Useful queries in the Supabase SQL editor:

```sql
select source, count(*) from waitlist group by 1 order by 2 desc;          -- where joins come from
select watch, count(*) from waitlist where watch is not null group by 1;   -- what people want watched
select name, source, count(*) from site_events group by 1, 2 order by 3 desc;
```

### Who gets into the app

While `HUESY_ACCESS` is `waitlist` (the default), only accounts with early access use the app:

- Early access is the addresses in `HUESY_EARLY_ACCESS` (comma separated emails or `@domain` rules),
  plus the QA account. To invite someone: add their email there, redeploy, and send them `/signup`.
- Everyone else who signs up lands on `/waitlist` ("You're on the list") and is added to the waitlist.
- The middleware keeps the app and brand setup closed to them, and every AI route checks again on the
  server (`lib/ai/access.js`), so nobody outside the list can spend credit.

**Opening up later:** set `HUESY_ACCESS=open` (the app) and `NEXT_PUBLIC_HUESY_SITE=open` (the site's
wording), then redeploy.

## Screens

| Route | What it is |
|---|---|
| `/` | Waitlist site: hero form, sample run, why, how, questions, final form |
| `/privacy`, `/contact` | What is stored and how to delete it; the contact form |
| `/login`, `/signup` | Email accounts. Google appears only when `NEXT_PUBLIC_GOOGLE_AUTH=on` |
| `/waitlist` | Where a signed in account without early access lands |
| `/onboarding` | A name and one sentence; Huesy drafts the rest; finishing starts the first search |
| `/home` (Today) | Greeting, what is new since the last visit, Best for your brand, everything with filters |
| `/search` (Watching) | Watchlists, when each was last checked, Check now |
| `/search/new` | The watchlist builder (`?edit=<id>` edits one) |
| `/search/[id]` | One watchlist: the live run, ranked signals, select several to write |
| `/compose` | Writing for several signals at once (up to ten) |
| `/saved` | Everything saved, in boards |
| `/profile` (Brand) | Brand, platforms and tone, examples, what to watch, account |

### How the product behaves

- **Huesy** (`components/huesy/Huesy.jsx`) is the one signature element: a small blob in the two brand
  colours with eyes that follow the pointer. Its mood says what is happening: `watch` while a search
  runs, `found`, `write`, `sleepy` when there is nothing yet, `oops` on errors. It speaks in the first
  person only in those moments.
- **Searches run in the background** (`lib/runner.js`). They stream: the searches it runs, the sites it
  reads and each signal as soon as it is written. Moving around the app never cancels one; a toast says
  when it is done. Signals from a run that stopped early are kept. A failed or empty run never saves a
  signal.
- **Every signal is ranked** for the brand (fit 1 to 5) with the angle for that brand, and the list sorts
  best fit first.
- **Writing** (`lib/writer.js`) also runs in the background, three posts at a time. "Write a post" opens
  the signal and starts writing at once for the platforms the brand publishes on. Every post is kept
  under its signal (`drafts`), edits save as they are typed, and every Refine can be undone.
- **One way to keep things**: Save. It goes to a board (Unsorted by default) and can be moved.
- **Undo, not confirmation dialogs**, for deleting watchlists, boards and saves.
- **Light and dark follow the system.** There is no in-app switch.
- Motion is one critically damped spring (`SPRING` in `components/ui.jsx`), feedback on pointer-down,
  and reduced motion swaps movement for cross fades.

## AI: models and cost

All calls go through `lib/ai/` on the server. The browser sends structured inputs (a platform, a
signal, the brand); the server builds the prompt (`lib/prompts.js`) and picks the model by job
(`lib/ai/models.js`), so a client can never send a raw prompt or choose a pricier model.

| Job | Model | Effort | Rough cost |
|---|---|---|---|
| Search (web search, up to 4 + 3 per platform) | Sonnet 5.5 | medium | $0.20 to $0.40 a search |
| Ranking the results for the brand | Haiku 5.5 | low | about $0.002 a search |
| Writing a post | Sonnet 5.5 | low | $0.005 to $0.03 a post |
| Refine a post | Sonnet 5.5 | low | under $0.02 |
| Draft a brand, tidy a brief, suggest an instruction | Haiku 5.5 | low | under $0.002 |

What changed from v1, which wrote with Opus 4.6 and searched with Sonnet 4.6:

- Writing moved from Opus 4.6 ($5/$25 per million tokens) to Sonnet 5.5 ($2/$10).
- Instagram is one call instead of three, and the reference images and brand block are cached, so the
  images are paid for once per run instead of three times per signal.
- Search uses `web_search_20260209`, which filters results before they reach the model, and asks for
  ISO dates and a signal type per item. It has room for a full list (16,000 tokens against v1's 4,096,
  which cut lists short).
- The small jobs moved to Haiku 5.5, about twenty times cheaper than Sonnet.
- Sonnet calls carry the server side fallback (`fallbacks: "default"`), so a rare decline is retried on
  Sonnet 5 instead of failing.

**Jev (TypeSafe) was considered and left out.** The only typed decision in Huesy is ranking. Haiku does
it for about $0.002 a search and also writes the angle line; Jev would save about $0.0015 a search,
could not write the angle, and would need its own TypeSafe key.

**Guards on spend:** every call is written to `ai_usage` with its tokens and estimated dollars, and each
account has a daily allowance (`HUESY_DAILY_USD_CAP`, default $3) checked before each call. A search
that the server pauses only carries on while it has spent less than `HUESY_SEARCH_USD_CAP` (default
$0.60), and keeps what it found so far.

```sql
select date_trunc('day', created_at) as day, kind, count(*), round(sum(usd), 3) as usd
from ai_usage where not mock group by 1, 2 order by 1 desc, 4 desc;
```

## The stand-in model and QA

`HUESY_AI_MOCK=1` swaps every model call for `lib/ai/mock.js`: the same shapes, realistic timing, no
network, no spend. Its signals are marked Sample. Typed into a watchlist's market, `#empty` returns
nothing, `#fail` fails mid search and `#slow` takes longer.

```bash
npm run build
HUESY_AI_MOCK=1 npx next start -p 4311
# in another shell
PHASE=fresh BASE=http://localhost:4311 QA_PASSWORD=... node scripts/qa/qa-app.mjs   # first run to sign out, 36 checks
PHASE=phone BASE=http://localhost:4311 QA_PASSWORD=... node scripts/qa/qa-app.mjs   # 390px phone, 7 checks
BASE=http://localhost:4311 SB_URL=... SB_KEY=... node scripts/qa/qa-site-api.mjs     # waitlist, events, gate, 31 checks
```

`qa-app.mjs` signs in as the QA account (`QA_EMAIL`, default `qa.huesy@example.com`). `PHASE=fresh`
expects that account to have no saved state (delete its `user_state` row first); `PHASE=migrate`
expects an old version 4 copy and checks it is upgraded. `qa-site-api.mjs` writes test rows with `qa+huesy-…`
addresses and a throwaway account, and deletes them at the end.

Local runs write to the same Supabase project as production. Every page the scripts open carries
`utm_source=qa-site`, and `qa-site-api.mjs` deletes only the events with that tag, so real visits are
never touched. After `qa-a11y.mjs`, clear its events with
`delete from site_events where utm->>'utm_source' = 'qa-site';`. QA leaves `ai_usage` rows marked
`mock`, which `delete from ai_usage where mock;` removes.

`probe-real.mjs` is the one script that spends money: one pass of every request shape on the real
models (about $0.22), read back from `ai_usage`. Run it against a local server that has the key.

## Backend on Supabase

- **Auth.** Email and password; Google once switched on. Sessions refresh in `middleware.js`, which only
  runs Supabase for app and account pages, never for the public site.
- **`user_state`**: one row per account with the whole app state as JSON (`STATE_VERSION` 5). The copy
  in a browser belongs to one account (`ownerId`): setup done before signing up is adopted by the first
  account, never handed to a second one, and signing out clears it. Older copies are migrated on load
  (`migrateState` in `lib/store.js`).
- **`waitlist`, `contact_messages`, `ai_usage`, `site_events`** have no policies at all: only the server
  writes them, with the secret key.

Schema is in `supabase/schema.sql` (additive; safe to re-run). Apply it with:

```bash
SUPABASE_DB_PASSWORD=... node scripts/db-migrate.js
```

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | For AI | Search, ranking and writing. Without it those steps say writing isn't switched on yet |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project settings, API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | The publishable key. Safe in the browser |
| `SUPABASE_SECRET_KEY` | Yes | Server only. Waitlist, contact, ledger, events |
| `HUESY_ACCESS` | Optional | `waitlist` (default) or `open` |
| `HUESY_EARLY_ACCESS` | Optional | Extra early access emails or `@domain` rules, comma separated |
| `NEXT_PUBLIC_HUESY_SITE` | Optional | `waitlist` (default) or `open`, the site's wording |
| `HUESY_DAILY_USD_CAP` | Optional | Per account daily AI allowance in dollars, default 3 |
| `HUESY_SEARCH_USD_CAP` | Optional | The most one search may spend before it stops continuing, default 0.6 |
| `HUESY_AI_MOCK` | QA only | `1` uses the stand-in model. Never set it in production |
| `NEXT_PUBLIC_GOOGLE_AUTH` | Optional | `on` shows Google sign in, once the provider is set up in Supabase |
| `NEXT_PUBLIC_SITE_URL` | Optional | For link previews, default the vercel.app address |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Optional | Shown on the contact page |
| `GOOGLE_AI_API_KEY` | Optional | Server side image route (unused by the screens today) |

## Deploy

The Vercel project is `content-engine` on the alt account. From a copy of the repo without
`node_modules`, `.next` and `.git`:

```bash
npx vercel deploy --yes --prod --scope xyzs-projects-03235428
```

## Project structure

```
app/
  page.jsx                  the waitlist site
  privacy/ contact/         site pages
  login/ signup/ forgot-password/ reset-password/ waitlist/
  auth/callback/            code exchange for confirmation and recovery links
  onboarding/ home/ search/ compose/ saved/ profile/
  api/                      ai, ai-search, waitlist, event, contact, generate-image, airtable
  icon.svg apple-icon.jsx opengraph-image.jsx
middleware.js               session refresh, app gate, waitlist redirect
components/
  ui.jsx                    buttons, fields, sheet, toast, segmented, tabs, states
  huesy/Huesy.jsx           the character
  site/                     Landing, JoinForm, JoinSheet, SampleRun, SiteChrome
  shell/                    AppShell, Wordmark
  auth/                     AuthShell, useSession, LogoutButton, StateSync
  signals/                  SignalCard, SignalSheet, RunPanel, SignalToolbar, BoardPicker, RegionPicker
  compose/PostCard.jsx      a written post: edit in place, copy, refine, save
  brand/forms.jsx           brand, tone, examples, targets
lib/
  ai/                       models, client, access, usage, errors, run, mock
  prompts.js                every prompt and the search parser
  runner.js writer.js       background searches and writing
  store.js                  persisted state, migrations, owner
  access-rules.js           who gets in
  site.js sample-run.js     site helpers and the sample run's content
  parse.js constants.js api.js
supabase/schema.sql         tables, policies, trigger
scripts/                    db-migrate.js, supabase-auth-config.js, qa/
```

## Notes for the next change

- `lib/prompts.js` is where output quality is tuned. The search parser depends on the `HEADLINE:` style
  lines and the three dash separator; posts depend on `===SECTION===` markers (`lib/parse.js`).
- Regions are stored as labels. Anything that reads `researchLocations` should go through
  `normaliseRegions` in `lib/constants.js`.
- Huesy checks when asked; nothing runs on a schedule yet. The copy says so on purpose ("check whenever
  you like"). A scheduled check would need a cron and its own spend limits.
